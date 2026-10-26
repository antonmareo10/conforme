// The investigator: Muse Spark decides what to look at on the paper, with tools; code runs every tool,
// keeps every result as numbered evidence and validates the closing verdict. The model never sets a number.
import sharp from "sharp";
import type { FunctionTool, ResponseInputItem, ResponseFunctionToolCall } from "openai/resources/responses/responses";
import { readerModel } from "../meta/models";
import type { ResponsesClient } from "../meta/privado";
import { readerClient, type Effort } from "../albaran/read";
import type { AlbaranLeido, Caja } from "../albaran/schema";
import { normalize } from "../albaran/normalize";
import { aritmeticaLinea, claveProducto, comprobar, inferirIva, precioReferencia, sello } from "../checks/engine";
import type { Albaran, Aviso, Contexto, Sello } from "../checks/types";
import { parsePrinted } from "../numbers";
import { mismoNumero } from "../albaran/localizar";

export type CampoLinea = "cantidad" | "precio_unitario" | "importe" | "descuento_pct";
const CAMPOS: CampoLinea[] = ["cantidad", "precio_unitario", "importe", "descuento_pct"];

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

export type Veredicto = "error_proveedor" | "celda_mal_leida" | "lectura_confirmada" | "revisar";
export type CampoCabecera = "total" | "base" | "cuota";

export interface Investigacion {
  investigado: boolean;
  leido: AlbaranLeido;
  albaran: Albaran;
  avisos: Aviso[];
  sello: Sello;
  pasos: Paso[];
  evidencias: Evidencia[];
  veredicto: Veredicto | null;
  valido: boolean;
  motivo?: string;
  explicacion?: string;
  ms: number;
  usage: { input_tokens: number; output_tokens: number };
}

export interface InvestigarOpts {
  client?: ResponsesClient;
  effort?: Effort;
  maxLlamadas?: number;
  maxMs?: number;
}

const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]): FunctionTool => ({
  type: "function",
  name,
  description,
  strict: true,
  parameters: { type: "object", additionalProperties: false, properties, required },
});

const TOOLS: FunctionTool[] = [
  tool("releer_celda", "Crop one cell of a product line on the paper, zoom it 2x and read it again, independently of the first reading.",
    { linea: { type: "integer", description: "1-based line number" }, campo: { type: "string", enum: CAMPOS } }, ["linea", "campo"]),
  tool("releer_fila", "Crop a whole product line on the paper, zoom it 2x and read quantity, unit price, discount and amount again.",
    { linea: { type: "integer" } }, ["linea"]),
  tool("historial_precio", "Last purchases of this product from this supplier (code lookup).", { linea: { type: "integer" } }, ["linea"]),
  tool("pedido", "Quantity the restaurant ordered for this product, if there is an order (code lookup).", { linea: { type: "integer" } }, ["linea"]),
  tool("releer_total", "Crop the note's total, or the VAT base or VAT amount of one tax row, zoom it 2x and read it again.",
    { campo: { type: "string", enum: ["total", "base", "cuota"] }, fila_iva: { type: "integer", description: "1-based tax row; use 1 for the total" } }, ["campo", "fila_iva"]),
  tool("recontar_filas", "Count the product rows printed on the paper again, independently.", {}, []),
  tool("cerrar", "Close the investigation. Cite the evidence ids that support the verdict. Code will verify everything.", {
    veredicto: { type: "string", enum: ["error_proveedor", "celda_mal_leida", "lectura_confirmada", "revisar"] },
    evidencias: { type: "array", items: { type: "string" } },
    correcciones: {
      type: "array",
      description: "Cells whose re-read shows a different value from the first reading: the text exactly as the re-read evidence shows it. Allowed with celda_mal_leida and error_proveedor.",
      items: { type: "object", additionalProperties: false, required: ["linea", "campo", "texto"], properties: { linea: { type: "integer" }, campo: { type: "string", enum: CAMPOS }, texto: { type: "string" } } },
    },
    explicacion: { type: "string", description: "One short sentence for the restaurant owner, in Spanish, without numbers you did not see in the evidence." },
  }, ["veredicto", "evidencias", "correcciones", "explicacion"]),
];

const INSTRUCCIONES = `You are the investigator of Conforme, an app that checks supplier delivery notes for a restaurant before anyone signs them.
Code already read the note and found warnings it cannot resolve alone. Decide what to look at on the paper, using at most {MAX} tool calls, then call "cerrar".
Rules:
- Code computed every number in the warnings. Never compute or invent amounts; code re-checks everything you say.
- A line that does not add up is either a misread cell (a re-read shows a different value that makes it add up) or a supplier error (re-reading the printed amount, and ideally the quantity or price, confirms what was read first).
- "celda_mal_leida": give the corrected text exactly as the re-read evidence shows it (a value from the row's list of printed numbers is fine), and cite that evidence.
- If a tool result carries "nota_del_codigo", take it into account: code found a printed number that makes the line add up.
- Warnings with motivo "dos_lecturas": two independent readings of that cell disagree (primera / segunda). Re-read that exact cell zoomed. If the zoomed re-read differs from the first reading, put it in "correcciones". If after correcting the line no longer adds up, re-read the line amount too: a confirmed printed amount that does not match quantity x price is a supplier error.
- "error_proveedor": only after a re-read confirms the printed amount. Cite that evidence.
- "lectura_confirmada": when the warnings are only doubts about a reading (unreadable fields, row count) and independent re-reads of those exact fields agree with the first reading.
- "revisar": when the evidence is unclear or contradictory.
- Prefer the cheapest decisive step. Answer only with tool calls.`;

/** Crop around a 0-1000 box with margins, zoom 2x. Returns JPEG bytes and the pixel rectangle. */
async function recortar(imagen: Buffer, W: number, H: number, caja: Caja, filaCompleta = false) {
  const x0 = (caja.x_min / 1000) * W, x1 = (caja.x_max / 1000) * W;
  const y0 = (caja.y_min / 1000) * H, y1 = (caja.y_max / 1000) * H;
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  // Boxes can be off by up to a full text line (measured on day 0 and in replays): pad about two
  // lines above and below; the prompt then names the line by its description.
  const padX = filaCompleta ? Math.max(0.02 * W, 0.05 * bw) : Math.max(0.6 * bw, 0.04 * W);
  const padY = Math.max(2.2 * bh, 0.035 * H);
  const x = Math.max(0, Math.floor(x0 - padX)), y = Math.max(0, Math.floor(y0 - padY));
  const w = Math.min(W - x, Math.ceil(bw + 2 * padX)), h = Math.min(H - y, Math.ceil(bh + 2 * padY));
  const crop = sharp(imagen).extract({ left: x, top: y, width: Math.max(1, w), height: Math.max(1, h) });
  const zoom = await crop.resize({ width: Math.max(2 * w, 480), kernel: "lanczos3" }).jpeg({ quality: 90 }).toBuffer();
  const mini = await sharp(zoom).resize({ width: 360, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  return { zoom, rect: { x, y, w, h }, miniatura: `data:image/jpeg;base64,${mini.toString("base64")}` };
}

async function preguntarImagen<T>(client: ResponsesClient, jpeg: Buffer, prompt: string, schema: Record<string, unknown>, effort: Effort) {
  const r = await client.responses.create({
    model: readerModel(),
    reasoning: { effort },
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, detail: "auto" }] }],
    text: { format: { type: "json_schema", name: "lectura", schema, strict: true } },
  });
  return { out: JSON.parse(r.output_text) as T, usage: r.usage };
}

const CAMPO_DE_DINERO_RE = /cantidad|precio|importe|base|cuota|total|iva|descuento|dto|unidades|peso/i;
const ETIQUETA: Record<CampoLinea, string> = { cantidad: "quantity", precio_unitario: "unit price", importe: "line amount", descuento_pct: "discount %" };
const norm = (t: string | null | undefined) => (t ?? "").replace(/\s|€/g, "").toLowerCase();

export async function investigar(
  docId: string,
  leidoOriginal: AlbaranLeido,
  imagen: Buffer,
  ctx: Contexto,
  opts: InvestigarOpts = {},
): Promise<Investigacion> {
  const t0 = Date.now();
  const client = opts.client ?? readerClient();
  const model = readerModel();
  const effort = opts.effort ?? "low";
  const maxLlamadas = opts.maxLlamadas ?? 4;
  const maxMs = opts.maxMs ?? 45_000;
  const { width: W = 0, height: H = 0 } = await sharp(imagen).metadata();
  const usage = { input_tokens: 0, output_tokens: 0 };
  const sumar = (u?: { input_tokens?: number; output_tokens?: number } | null) => {
    usage.input_tokens += u?.input_tokens ?? 0;
    usage.output_tokens += u?.output_tokens ?? 0;
  };

  let leido: AlbaranLeido = structuredClone(leidoOriginal);
  let albaran = inferirIva(normalize(docId, leido));
  let avisos = comprobar(albaran, ctx);
  const dudas = avisos.filter((a) => a.clase === "lectura");
  const base = { leido, albaran, avisos, sello: sello(avisos), pasos: [] as Paso[], evidencias: [] as Evidencia[], ms: 0, usage };
  if (!dudas.length) return { ...base, investigado: false, veredicto: null, valido: true, ms: Date.now() - t0 };

  const evidencias: Evidencia[] = [];
  const pasos: Paso[] = [];
  const nuevaEvidencia = (e: Omit<Evidencia, "id">) => {
    const ev = { id: `ev${evidencias.length + 1}`, ...e };
    evidencias.push(ev);
    return ev;
  };

  // ---- tools, run by code ----
  const lineaLeida = (n: number) => leido.lineas[n - 1];
  async function releerCelda(linea: number, campo: CampoLinea) {
    const l = lineaLeida(linea);
    if (!l) return { error: `no hay línea ${linea}` };
    const celda = l[campo].caja;
    const fila = l.caja_fila;
    if (!celda && !fila) return { error: "esa celda no tiene caja en el papel" };
    // From the start of the row to the cell, so the line's description is in the crop too.
    const caja = celda && fila ? { x_min: Math.min(fila.x_min, celda.x_min), x_max: Math.max(celda.x_max, Math.min(fila.x_max, celda.x_max + 40)), y_min: Math.min(fila.y_min, celda.y_min), y_max: Math.max(fila.y_max, celda.y_max) } : (celda ?? fila)!;
    const { zoom, rect, miniatura } = await recortar(imagen, W, H, caja, !!fila);
    const desc = l.descripcion.texto ? `the product line whose description is "${l.descripcion.texto}"` : `product line ${linea}`;
    const { out, usage: u } = await preguntarImagen<{ linea_visible: boolean; texto: string | null; legible: boolean }>(client, zoom,
      `This is a zoomed crop of a Spanish supplier delivery note. It may show neighbouring lines too. Find ${desc} and copy exactly the ${ETIQUETA[campo]} printed on that line, character by character (keep the comma). ` +
        "Do not compute anything. If that line is not in the crop, linea_visible=false. If you cannot read the value with certainty, legible=false.",
      { type: "object", additionalProperties: false, required: ["linea_visible", "texto", "legible"], properties: { linea_visible: { type: "boolean" }, texto: { type: ["string", "null"] }, legible: { type: "boolean" } } }, effort);
    sumar(u);
    const ok = out.linea_visible && out.legible;
    const ev = nuevaEvidencia({ herramienta: "releer_celda", linea, campo, texto: ok ? out.texto : null, recorte: rect, miniatura, datos: { primeraLectura: l[campo].texto, legible: out.legible, lineaVisible: out.linea_visible } });
    return { evidenciaId: ev.id, primera_lectura: l[campo].texto, relectura: ev.texto, legible: out.legible, linea_visible: out.linea_visible };
  }
  async function releerFila(linea: number) {
    const l = lineaLeida(linea);
    if (!l?.caja_fila) return { error: "esa línea no tiene caja en el papel" };
    const { zoom, rect, miniatura } = await recortar(imagen, W, H, l.caja_fila, true);
    const props: Record<string, unknown> = Object.fromEntries(CAMPOS.map((c) => [c, { type: ["string", "null"] }]));
    props.numeros_en_la_fila = { type: "array", items: { type: "string" } };
    props.linea_visible = { type: "boolean" };
    const desc = l.descripcion.texto ? `the product line whose description is "${l.descripcion.texto}"` : `product line ${linea}`;
    const { out, usage: u } = await preguntarImagen<Record<CampoLinea, string | null> & { numeros_en_la_fila: string[]; linea_visible: boolean }>(client, zoom,
      `This is a zoomed crop of a Spanish supplier delivery note. It may show neighbouring lines too. Find ${desc}. ` +
        "For that line only, copy exactly as printed the quantity the unit price applies to (for goods sold by weight, the weight, not the number of pieces or boxes), the unit price, discount % and line amount (null if not printed), " +
        "and list every number printed on that line, as printed. Do not compute anything. If that line is not in the crop, linea_visible=false and everything null.",
      { type: "object", additionalProperties: false, required: [...CAMPOS, "numeros_en_la_fila", "linea_visible"], properties: props }, effort);
    sumar(u);
    const { numeros_en_la_fila: numerosLeidos, linea_visible, ...relecturaLeida } = out;
    const numeros = linea_visible ? numerosLeidos : [];
    const relectura = linea_visible ? relecturaLeida : Object.fromEntries(CAMPOS.map((c) => [c, null]));
    const ev = nuevaEvidencia({ herramienta: "releer_fila", linea, recorte: rect, miniatura, datos: { relectura, numeros, primeraLectura: Object.fromEntries(CAMPOS.map((c) => [c, l[c].texto])) } });
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

  // ---- what the model sees: printed text and code-computed warnings ----
  const resumen = {
    proveedor: albaran.proveedor,
    numero: albaran.numero,
    fecha: albaran.fecha,
    lineas: leido.lineas.map((l, i) => ({ n: i + 1, descripcion: l.descripcion.texto, cantidad: l.cantidad.texto, unidad: l.unidad, precio_unitario: l.precio_unitario.texto, descuento_pct: l.descuento_pct.texto, importe: l.importe.texto, iva: l.iva_pct.texto })),
    impuestos: leido.impuestos.map((t) => ({ iva: t.iva_pct.texto, base: t.base.texto, cuota: t.cuota.texto })),
    total: leido.total.texto,
    avisos: dudas.map((a) => ({ codigo: a.codigo, linea: a.lineaIdx != null ? a.lineaIdx + 1 : null, datos_calculados_por_codigo: a.datos })),
  };
  const input: ResponseInputItem[] = [
    { role: "developer", content: INSTRUCCIONES.replace("{MAX}", String(maxLlamadas)) },
    { role: "user", content: JSON.stringify(resumen) },
  ];

  type Cierre = { veredicto: Veredicto; evidencias: string[]; correcciones: { linea: number; campo: CampoLinea; texto: string }[]; explicacion: string };
  let cierre = null as Cierre | null;
  let llamadas = 0;
  for (let ronda = 0; ronda < maxLlamadas + 2 && !cierre && Date.now() - t0 < maxMs; ronda++) {
    // The Meta API only supports tool_choice "auto": at the limit, only "cerrar" is offered.
    const soloCerrar = llamadas >= maxLlamadas;
    const r = await client.responses.create({ model, reasoning: { effort }, tools: soloCerrar ? TOOLS.filter((t) => t.name === "cerrar") : TOOLS, input });
    sumar(r.usage);
    const calls = r.output.filter((o): o is ResponseFunctionToolCall => o.type === "function_call");
    input.push(...(r.output as ResponseInputItem[]));
    if (!calls.length) {
      input.push({ role: "user", content: soloCerrar ? "Call cerrar now." : "Use a tool or call cerrar. Answer only with tool calls." });
      continue;
    }
    for (const call of calls) {
      const t1 = Date.now();
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.arguments || "{}"); } catch { /* invalid args → error result */ }
      let out: unknown;
      if (call.name === "cerrar") {
        cierre = args as unknown as Cierre;
        out = { ok: true };
      } else if (llamadas >= maxLlamadas) {
        out = { error: "límite de llamadas alcanzado: cierra ya" };
      } else {
        llamadas++;
        const n = Number(args.linea);
        out =
          call.name === "releer_celda" ? await releerCelda(n, args.campo as CampoLinea) :
          call.name === "releer_fila" ? await releerFila(n) :
          call.name === "releer_total" ? await releerTotal(args.campo as CampoCabecera, Number(args.fila_iva) || 1) :
          call.name === "historial_precio" ? historial(n) :
          call.name === "pedido" ? pedido(n) :
          call.name === "recontar_filas" ? await recontarFilas() :
          { error: `herramienta desconocida ${call.name}` };
      }
      const o = out as { evidenciaId?: string; error?: string };
      pasos.push({ n: pasos.length + 1, herramienta: call.name, args, resumen: o.error ?? JSON.stringify(out).slice(0, 240), evidenciaId: o.evidenciaId, ms: Date.now() - t1 });
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(out) });
      if (cierre) break;
    }
  }

  // ---- code validates the verdict ----
  const invalido = (motivo: string): Investigacion => ({ ...base, leido: leidoOriginal, pasos, evidencias, investigado: true, veredicto: cierre?.veredicto ?? null, valido: false, motivo, explicacion: cierre?.explicacion, ms: Date.now() - t0, usage });
  if (!cierre) return invalido("sin_cierre");
  const citadas = cierre.evidencias.map((id) => evidencias.find((e) => e.id === id));
  if (citadas.some((e) => !e)) return invalido("cita_evidencias_inexistentes");
  const relecturaDe = (linea: number, campo: CampoLinea): string | null | undefined => {
    for (const e of [...evidencias].reverse()) {
      if (e.linea !== linea) continue;
      if (e.herramienta === "releer_celda" && e.campo === campo) return e.texto;
      if (e.herramienta === "releer_fila") return (e.datos?.relectura as Record<string, string | null>)?.[campo];
    }
    return undefined;
  };

  if (cierre.veredicto === "revisar") {
    return { ...base, pasos, evidencias, investigado: true, veredicto: "revisar", valido: true, explicacion: cierre.explicacion, ms: Date.now() - t0, usage };
  }

  // 1. Corrections, each backed by a re-read that shows exactly that text (any verdict may carry them).
  const corregido = structuredClone(leido);
  const reparadas: { linea: number; campo: CampoLinea; antes: string | null; despues: string; evidencia: string }[] = [];
  for (const c of cierre.correcciones ?? []) {
    const visto = relecturaDe(c.linea, c.campo);
    const enLaFila = evidencias.some((e) => e.linea === c.linea && e.herramienta === "releer_fila" && ((e.datos?.numeros as string[]) ?? []).some((t) => norm(t) === norm(c.texto)));
    if ((visto == null || norm(visto) !== norm(c.texto)) && !enLaFila) return invalido("correccion_sin_evidencia");
    const l = corregido.lineas[c.linea - 1];
    if (!l) return invalido("linea_inexistente");
    if (mismoNumero(l[c.campo].texto, c.texto)) continue; // nothing to correct
    const ev = [...evidencias].reverse().find((e) => e.linea === c.linea && (e.herramienta === "releer_fila" || e.campo === c.campo))!;
    reparadas.push({ linea: c.linea, campo: c.campo, antes: l[c.campo].texto, despues: c.texto, evidencia: ev.id });
    l[c.campo] = { ...l[c.campo], texto: c.texto };
  }

  // 2. Two readings that disagreed are settled only by a zoomed re-read matching the final text.
  corregido.discrepancias = (corregido.discrepancias ?? []).filter((d) => {
    const visto = relecturaDe(d.linea, d.campo);
    return !(visto != null && mismoNumero(visto, corregido.lineas[d.linea - 1]?.[d.campo].texto ?? null));
  });

  // 3. Unreadable fields reported by the model are settled by a re-read that agrees.
  const confirmado = (campoIlegible: string): boolean => {
    const m = campoIlegible.match(/l[ií]nea\s*(\d+)\D*?(cantidad|precio|importe|descuento|dto)/i);
    if (m) {
      const n = Number(m[1]);
      const campo: CampoLinea = /precio/i.test(m[2]) ? "precio_unitario" : /descuento|dto/i.test(m[2]) ? "descuento_pct" : (m[2].toLowerCase() as CampoLinea);
      const visto = relecturaDe(n, campo);
      return visto != null && mismoNumero(visto, corregido.lineas[n - 1]?.[campo].texto ?? null);
    }
    const h = campoIlegible.match(/(total|base|cuota)/i);
    if (h) {
      const c = h[1].toLowerCase();
      const evs = evidencias.filter((e) => e.herramienta === "releer_total" && e.campo?.startsWith(c));
      return evs.length > 0 && evs.every((e) => mismoNumero(e.texto ?? null, (e.datos?.primeraLectura as string) ?? null));
    }
    return !CAMPO_DE_DINERO_RE.test(campoIlegible); // non-money doubts do not change the stamp anyway
  };
  corregido.ilegible = corregido.ilegible.filter((c) => !confirmado(c));
  const recuento = [...evidencias].reverse().find((e) => e.herramienta === "recontar_filas");
  if (recuento && recuento.datos?.filas === corregido.lineas.length) corregido.filas_de_producto_contadas = corregido.lineas.length;

  // 4. Lines that still do not add up: a supplier error only if the amount was confirmed on the paper,
  //    no re-read contradicts the quantity or price, and no other printed number makes the line add up.
  const a2 = inferirIva(normalize(docId, corregido));
  const confirmados: Record<number, string> = {};
  for (const l of a2.lineas) {
    const r = aritmeticaLinea(l);
    if (!r || r.ok) continue;
    const n = l.idx + 1;
    const lt = corregido.lineas[l.idx];
    const imp = relecturaDe(n, "importe");
    if (imp == null || !mismoNumero(imp, lt.importe.texto)) continue;
    const q = relecturaDe(n, "cantidad"), p = relecturaDe(n, "precio_unitario");
    if ((q != null && !mismoNumero(q, lt.cantidad.texto)) || (p != null && !mismoNumero(p, lt.precio_unitario.texto))) continue;
    const filasEv = evidencias.filter((e) => e.linea === n && e.herramienta === "releer_fila");
    if (filasEv.some((e) => otraCantidadQueCuadra(n, (e.datos?.numeros as string[]) ?? []))) return invalido("otra_cantidad_impresa_cuadra");
    const ev = [...evidencias].reverse().find((e) => e.linea === n && (e.herramienta === "releer_fila" || e.campo === "importe"))!;
    confirmados[l.idx] = ev.id;
  }

  // 5. What each verdict must show.
  if (cierre.veredicto === "celda_mal_leida") {
    if (!reparadas.length) return invalido("sin_correcciones");
    if (reparadas.some((r) => !aritmeticaLinea(a2.lineas[r.linea - 1])?.ok)) return invalido("la_correccion_no_cuadra");
  }
  if (cierre.veredicto === "error_proveedor" && !Object.keys(confirmados).length) return invalido("error_no_confirmado_en_el_papel");

  leido = corregido;
  albaran = { ...a2, confirmados };
  avisos = [
    ...comprobar(albaran, ctx),
    ...reparadas.map((r): Aviso => ({ codigo: "CELDA_REPARADA", clase: "info", docId, lineaIdx: r.linea - 1, centimos: 0, datos: { campo: r.campo, antes: r.antes ?? "", despues: r.despues, evidencia: r.evidencia } })),
  ];
  if (cierre.veredicto === "lectura_confirmada" && avisos.some((a) => a.clase === "lectura")) return invalido("quedan_dudas");
  return { leido, albaran, avisos, sello: sello(avisos), pasos, evidencias, investigado: true, veredicto: cierre.veredicto, valido: true, explicacion: cierre.explicacion, ms: Date.now() - t0, usage };
}
