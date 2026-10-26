// The agent's workbench: the tools Muse Spark can call, run by code. Every result is kept as numbered
// evidence (with the crop of the paper it was read from), and the loop that lets the model pick them.
// Shared by the investigator (doubts about a reading) and the claim file (money asked of a supplier).
import type OpenAI from "openai";
import sharp from "sharp";
import type { FunctionTool, ResponseInputItem, ResponseFunctionToolCall } from "openai/resources/responses/responses";
import { MODELS } from "../meta/models";
import type { Effort } from "../albaran/read";
import type { AlbaranLeido, Caja } from "../albaran/schema";
import { aritmeticaLinea, claveProducto, precioReferencia } from "../checks/engine";
import type { Albaran, Contexto } from "../checks/types";
import { parsePrinted } from "../numbers";

export type CampoLinea = "cantidad" | "precio_unitario" | "importe" | "descuento_pct";
export const CAMPOS: CampoLinea[] = ["cantidad", "precio_unitario", "importe", "descuento_pct"];
export type CampoCabecera = "total" | "base" | "cuota";

export interface Evidencia {
  id: string;
  herramienta: string;
  linea?: number; // 1-based, as shown to the model and the user
  campo?: string;
  texto?: string | null;
  /** Crop of the paper this evidence was read from, in pixels of the image the reader saw. */
  recorte?: { x: number; y: number; w: number; h: number };
  /** Small JPEG of the crop for the trace (data URL). */
  miniatura?: string;
  datos?: Record<string, unknown>;
}

export interface Paso {
  n: number;
  herramienta: string;
  args: Record<string, unknown>;
  resumen: string;
  evidenciaId?: string;
  ms: number;
}

export interface Uso { input_tokens: number; output_tokens: number }

export const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]): FunctionTool => ({
  type: "function",
  name,
  description,
  strict: true,
  parameters: { type: "object", additionalProperties: false, properties, required },
});

export const HERRAMIENTAS: Record<string, FunctionTool> = {
  releer_celda: tool("releer_celda", "Crop one cell of a product line on the paper, zoom it 2x and read it again, independently of the first reading.",
    { linea: { type: "integer", description: "1-based line number" }, campo: { type: "string", enum: CAMPOS } }, ["linea", "campo"]),
  releer_fila: tool("releer_fila", "Crop a whole product line on the paper, zoom it 2x and read quantity, unit price, discount and amount again.",
    { linea: { type: "integer" } }, ["linea"]),
  historial_precio: tool("historial_precio", "Last purchases of this product from this supplier (code lookup).", { linea: { type: "integer" } }, ["linea"]),
  pedido: tool("pedido", "Quantity the restaurant ordered for this product, if there is an order (code lookup).", { linea: { type: "integer" } }, ["linea"]),
  releer_total: tool("releer_total", "Crop the note's total, or the VAT base or VAT amount of one tax row, zoom it 2x and read it again.",
    { campo: { type: "string", enum: ["total", "base", "cuota"] }, fila_iva: { type: "integer", description: "1-based tax row; use 1 for the total" } }, ["campo", "fila_iva"]),
  recontar_filas: tool("recontar_filas", "Count the product rows printed on the paper again, independently.", {}, []),
};

/** Crop around a 0-1000 box with margins, zoom 2x. Returns JPEG bytes and the pixel rectangle. */
async function recortar(imagen: Buffer, W: number, H: number, caja: Caja, filaCompleta = false, banda = false) {
  const x0 = (caja.x_min / 1000) * W, x1 = (caja.x_max / 1000) * W;
  const y0 = (caja.y_min / 1000) * H, y1 = (caja.y_max / 1000) * H;
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  // Boxes can be off by up to a full text line (measured on day 0 and in replays): pad about two
  // lines above and below; the prompt then names the line by its description. A table band is
  // already wide: only a small margin.
  const padX = banda ? 0 : filaCompleta ? Math.max(0.02 * W, 0.05 * bw) : Math.max(0.6 * bw, 0.04 * W);
  const padY = banda ? 0.02 * H : Math.max(2.2 * bh, 0.035 * H);
  const x = Math.max(0, Math.floor(x0 - padX)), y = Math.max(0, Math.floor(y0 - padY));
  const w = Math.min(W - x, Math.ceil(bw + 2 * padX)), h = Math.min(H - y, Math.ceil(bh + 2 * padY));
  const crop = sharp(imagen).extract({ left: x, top: y, width: Math.max(1, w), height: Math.max(1, h) });
  const zoom = await crop.resize({ width: Math.max(2 * w, 480), kernel: "lanczos3" }).jpeg({ quality: 90 }).toBuffer();
  const mini = await sharp(zoom).resize({ width: 360, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  return { zoom, rect: { x, y, w, h }, miniatura: `data:image/jpeg;base64,${mini.toString("base64")}` };
}

async function preguntarImagen<T>(client: OpenAI, jpeg: Buffer, prompt: string, schema: Record<string, unknown>, effort: Effort) {
  const r = await client.responses.create({
    model: MODELS.read,
    reasoning: { effort },
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, detail: "auto" }] }],
    text: { format: { type: "json_schema", name: "lectura", schema, strict: true } },
  });
  return { out: JSON.parse(r.output_text) as T, usage: r.usage };
}

const ETIQUETA: Record<CampoLinea, string> = { cantidad: "quantity", precio_unitario: "unit price", importe: "line amount", descuento_pct: "discount %" };
export const norm = (t: string | null | undefined) => (t ?? "").replace(/\s|€/g, "").toLowerCase();

export interface MesaOpts {
  docId: string;
  leido: AlbaranLeido;
  albaran: Albaran;
  imagen: Buffer;
  W: number;
  H: number;
  ctx: Contexto;
  client: OpenAI;
  effort: Effort;
  usage: Uso;
  /** Evidence ids start here (a second agent on the same note keeps numbering after the first). */
  primeraEvidencia?: number;
}

/** The tools, bound to one note. Code runs them; the model only chooses which. */
export function mesaDeTrabajo(o: MesaOpts) {
  const { leido, albaran, imagen, W, H, ctx, client, effort, usage } = o;
  const base = (o.primeraEvidencia ?? 1) - 1;
  const evidencias: Evidencia[] = [];
  const sumar = (u?: { input_tokens?: number; output_tokens?: number } | null) => {
    usage.input_tokens += u?.input_tokens ?? 0;
    usage.output_tokens += u?.output_tokens ?? 0;
  };
  const nuevaEvidencia = (e: Omit<Evidencia, "id">) => {
    const ev = { id: `ev${base + evidencias.length + 1}`, ...e };
    evidencias.push(ev);
    return ev;
  };
  const lineaLeida = (n: number) => leido.lineas[n - 1];
  /** The whole line table with two rows of margin: where to look again when a line is not in its crop. */
  const bandaTabla = (): Caja | null => {
    const fs = leido.lineas.map((l) => l.caja_fila).filter((c): c is Caja => !!c && c.y_max > c.y_min);
    if (!fs.length) return null;
    const h = Math.max(...fs.map((c) => c.y_max - c.y_min));
    return { x_min: 0, x_max: 1000, y_min: Math.max(0, Math.min(...fs.map((c) => c.y_min)) - 2 * h), y_max: Math.min(1000, Math.max(...fs.map((c) => c.y_max)) + 2 * h) };
  };
  /** Crop, ask, and if the model says the line is not in the crop, ask once more on the whole table band. */
  async function mirar<T extends { linea_visible: boolean }>(caja: Caja, filaCompleta: boolean, prompt: string, schema: Record<string, unknown>) {
    let c = await recortar(imagen, W, H, caja, filaCompleta);
    let q = await preguntarImagen<T>(client, c.zoom, prompt, schema, effort);
    sumar(q.usage);
    let ampliado = false;
    const b = bandaTabla();
    if (!q.out.linea_visible && b) {
      c = await recortar(imagen, W, H, b, true, true);
      q = await preguntarImagen<T>(client, c.zoom, prompt, schema, effort);
      sumar(q.usage);
      ampliado = true;
    }
    return { out: q.out, rect: c.rect, miniatura: c.miniatura, ampliado };
  }

  async function releerCelda(linea: number, campo: CampoLinea) {
    const l = lineaLeida(linea);
    if (!l) return { error: `no hay línea ${linea}` };
    const celda = l[campo].caja;
    const fila = l.caja_fila;
    if (!celda && !fila) return { error: "esa celda no tiene caja en el papel" };
    // From the start of the row to the cell, so the line's description is in the crop too.
    const caja = celda && fila ? { x_min: Math.min(fila.x_min, celda.x_min), x_max: Math.max(celda.x_max, Math.min(fila.x_max, celda.x_max + 40)), y_min: Math.min(fila.y_min, celda.y_min), y_max: Math.max(fila.y_max, celda.y_max) } : (celda ?? fila)!;
    const desc = l.descripcion.texto ? `the product line whose description is "${l.descripcion.texto}"` : `product line ${linea}`;
    const { out, rect, miniatura, ampliado } = await mirar<{ linea_visible: boolean; texto: string | null; legible: boolean }>(caja, !!fila,
      `This is a zoomed crop of a Spanish supplier delivery note. It may show neighbouring lines too. Find ${desc} and copy exactly the ${ETIQUETA[campo]} printed on that line, character by character (keep the comma). ` +
        "Do not compute anything. If that line is not in the crop, linea_visible=false. If you cannot read the value with certainty, legible=false.",
      { type: "object", additionalProperties: false, required: ["linea_visible", "texto", "legible"], properties: { linea_visible: { type: "boolean" }, texto: { type: ["string", "null"] }, legible: { type: "boolean" } } });
    const ok = out.linea_visible && out.legible;
    const ev = nuevaEvidencia({ herramienta: "releer_celda", linea, campo, texto: ok ? out.texto : null, recorte: rect, miniatura, datos: { primeraLectura: l[campo].texto, legible: out.legible, lineaVisible: out.linea_visible, ...(ampliado ? { ampliado: true } : {}) } });
    return { evidenciaId: ev.id, primera_lectura: l[campo].texto, relectura: ev.texto, legible: out.legible, linea_visible: out.linea_visible };
  }

  async function releerFila(linea: number) {
    const l = lineaLeida(linea);
    if (!l?.caja_fila) return { error: "esa línea no tiene caja en el papel" };
    const props: Record<string, unknown> = Object.fromEntries(CAMPOS.map((c) => [c, { type: ["string", "null"] }]));
    props.numeros_en_la_fila = { type: "array", items: { type: "string" } };
    props.linea_visible = { type: "boolean" };
    const desc = l.descripcion.texto ? `the product line whose description is "${l.descripcion.texto}"` : `product line ${linea}`;
    const { out, rect, miniatura, ampliado } = await mirar<Record<CampoLinea, string | null> & { numeros_en_la_fila: string[]; linea_visible: boolean }>(l.caja_fila, true,
      `This is a zoomed crop of a Spanish supplier delivery note. It may show neighbouring lines too. Find ${desc}. ` +
        "For that line only, copy exactly as printed the quantity the unit price applies to (for goods sold by weight, the weight, not the number of pieces or boxes), the unit price, discount % and line amount (null if not printed), " +
        "and list every number printed on that line, as printed. Do not compute anything. If that line is not in the crop, linea_visible=false and everything null.",
      { type: "object", additionalProperties: false, required: [...CAMPOS, "numeros_en_la_fila", "linea_visible"], properties: props });
    const { numeros_en_la_fila: numerosLeidos, linea_visible, ...relecturaLeida } = out;
    const numeros = linea_visible ? numerosLeidos : [];
    const relectura = linea_visible ? relecturaLeida : Object.fromEntries(CAMPOS.map((c) => [c, null]));
    const ev = nuevaEvidencia({ herramienta: "releer_fila", linea, recorte: rect, miniatura, datos: { relectura, numeros, primeraLectura: Object.fromEntries(CAMPOS.map((c) => [c, l[c].texto])), ...(ampliado ? { ampliado: true } : {}) } });
    const otra = otraCantidadQueCuadra(linea, numeros);
    return {
      evidenciaId: ev.id, primera_lectura: ev.datos!.primeraLectura, relectura, numeros_en_la_fila: numeros,
      ...(otra ? { nota_del_codigo: `En esta fila también aparece ${otra}; con esa cantidad la línea cuadra. Probablemente la cantidad se leyó de otra columna (piezas en vez de peso).` } : {}),
    };
  }

  async function releerTotal(campo: CampoCabecera, fila: number) {
    const f = campo === "total" ? leido.total : leido.impuestos[fila - 1]?.[campo];
    if (!f) return { error: `no hay ${campo} en la fila de IVA ${fila}` };
    if (!f.caja) return { error: "ese campo no tiene caja en el papel" };
    const { zoom, rect, miniatura } = await recortar(imagen, W, H, f.caja);
    const que = campo === "total" ? "the total amount of the note" : campo === "base" ? `the VAT base (taxable amount) of tax row ${fila}` : `the VAT amount of tax row ${fila}`;
    const { out, usage: u } = await preguntarImagen<{ texto: string | null; legible: boolean }>(client, zoom,
      `This is a zoomed crop of a Spanish supplier delivery note, around ${que}. Copy that number exactly as printed (keep the comma). Do not compute anything. If you cannot read it with certainty, legible=false.`,
      { type: "object", additionalProperties: false, required: ["texto", "legible"], properties: { texto: { type: ["string", "null"] }, legible: { type: "boolean" } } }, effort);
    sumar(u);
    const ev = nuevaEvidencia({ herramienta: "releer_total", campo: campo === "total" ? "total" : `${campo} ${fila}`, texto: out.legible ? out.texto : null, recorte: rect, miniatura, datos: { primeraLectura: f.texto, legible: out.legible } });
    return { evidenciaId: ev.id, primera_lectura: f.texto, relectura: ev.texto, legible: out.legible };
  }

  function otraCantidadQueCuadra(linea: number, numeros: string[]): string | null {
    const l = albaran.lineas[linea - 1];
    if (!l?.precio || !l.importe) return null;
    for (const t of numeros) {
      if (norm(t) === norm(leido.lineas[linea - 1]?.cantidad.texto)) continue;
      const q = parsePrinted(t);
      if (!q) continue;
      const prueba = { ...l, cantidad: q };
      if (aritmeticaLinea(prueba)?.ok) return t;
    }
    return null;
  }

  function historial(linea: number) {
    const l = albaran.lineas[linea - 1];
    if (!l) return { error: `no hay línea ${linea}` };
    const ref = precioReferencia(ctx, albaran.proveedor, claveProducto(l.descripcion), albaran.fecha);
    const compras = ctx.historial.filter((c) => claveProducto(c.producto) === claveProducto(l.descripcion)).slice(-6);
    const ev = nuevaEvidencia({ herramienta: "historial_precio", linea, datos: { referencia: ref, compras } });
    return { evidenciaId: ev.id, compras: compras.map((c) => ({ fecha: c.fecha, precio: c.precioUnit, unidad: c.unidad })), mediana_6_semanas: ref?.mediana ?? null };
  }

  function pedido(linea: number) {
    const l = albaran.lineas[linea - 1];
    const p = ctx.pedidos.find((x) => claveProducto(x.producto) === claveProducto(l?.descripcion ?? null));
    const ev = nuevaEvidencia({ herramienta: "pedido", linea, datos: { pedido: p ?? null } });
    return { evidenciaId: ev.id, pedido: p ? { cantidad: p.cantidad, unidad: p.unidad } : null };
  }

  async function recontarFilas() {
    const { out, usage: u } = await preguntarImagen<{ filas: number }>(client, imagen,
      "Count the product rows printed in the line table of this delivery note. Do not count headers, subtotals, tax rows or totals.",
      { type: "object", additionalProperties: false, required: ["filas"], properties: { filas: { type: "integer" } } }, effort);
    sumar(u);
    const ev = nuevaEvidencia({ herramienta: "recontar_filas", datos: { filas: out.filas, primeraCuenta: leido.filas_de_producto_contadas, lineasLeidas: leido.lineas.length } });
    return { evidenciaId: ev.id, filas: out.filas, lineas_leidas: leido.lineas.length };
  }

  /** Run one tool call by name. Unknown names come back as an error result for the model. */
  async function ejecutar(name: string, args: Record<string, unknown>): Promise<unknown> {
    const n = Number(args.linea);
    return name === "releer_celda" ? await releerCelda(n, args.campo as CampoLinea) :
      name === "releer_fila" ? await releerFila(n) :
      name === "releer_total" ? await releerTotal(args.campo as CampoCabecera, Number(args.fila_iva) || 1) :
      name === "historial_precio" ? historial(n) :
      name === "pedido" ? pedido(n) :
      name === "recontar_filas" ? await recontarFilas() :
      { error: `herramienta desconocida ${name}` };
  }

  /** Latest re-read of one cell of a line (a cell re-read or a whole-row re-read). */
  function relecturaDe(linea: number, campo: CampoLinea): string | null | undefined {
    for (const e of [...evidencias].reverse()) {
      if (e.linea !== linea) continue;
      if (e.herramienta === "releer_celda" && e.campo === campo) return e.texto;
      if (e.herramienta === "releer_fila") return (e.datos?.relectura as Record<string, string | null>)?.[campo];
    }
    return undefined;
  }

  return { evidencias, sumar, ejecutar, historial, pedido, otraCantidadQueCuadra, relecturaDe };
}

export type Mesa = ReturnType<typeof mesaDeTrabajo>;

/**
 * The agent loop: the model picks tools until it calls the closing tool, within a call and time budget.
 * The Meta API only supports tool_choice "auto": at the limit, only the closing tool is offered.
 */
export async function bucleAgente<C>(o: {
  client: OpenAI;
  effort: Effort;
  input: ResponseInputItem[];
  herramientas: FunctionTool[];
  cierre: FunctionTool;
  mesa: Mesa;
  maxLlamadas: number;
  maxMs: number;
  t0: number;
}): Promise<{ cierre: C | null; pasos: Paso[] }> {
  const { client, effort, input, mesa, maxLlamadas, maxMs, t0 } = o;
  const todas = [...o.herramientas, o.cierre];
  const pasos: Paso[] = [];
  let cierre = null as C | null;
  let llamadas = 0;
  for (let ronda = 0; ronda < maxLlamadas + 2 && !cierre && Date.now() - t0 < maxMs; ronda++) {
    const soloCerrar = llamadas >= maxLlamadas;
    const r = await client.responses.create({ model: MODELS.read, reasoning: { effort }, tools: soloCerrar ? [o.cierre] : todas, input });
    mesa.sumar(r.usage);
    const calls = r.output.filter((x): x is ResponseFunctionToolCall => x.type === "function_call");
    input.push(...(r.output as ResponseInputItem[]));
    if (!calls.length) {
      input.push({ role: "user", content: soloCerrar ? `Call ${o.cierre.name} now.` : `Use a tool or call ${o.cierre.name}. Answer only with tool calls.` });
      continue;
    }
    for (const call of calls) {
      const t1 = Date.now();
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.arguments || "{}"); } catch { /* invalid args → error result */ }
      let out: unknown;
      if (call.name === o.cierre.name) {
        cierre = args as unknown as C;
        out = { ok: true };
      } else if (llamadas >= maxLlamadas) {
        out = { error: "límite de llamadas alcanzado: cierra ya" };
      } else {
        llamadas++;
        out = await mesa.ejecutar(call.name, args);
      }
      const r2 = out as { evidenciaId?: string; error?: string };
      pasos.push({ n: pasos.length + 1, herramienta: call.name, args, resumen: r2.error ?? JSON.stringify(out).slice(0, 240), evidenciaId: r2.evidenciaId, ms: Date.now() - t1 });
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(out) });
      if (cierre) break;
    }
  }
  return { cierre, pasos };
}
