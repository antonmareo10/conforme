// The investigator: Muse Spark decides what to look at on the paper, with tools; code runs every tool,
// keeps every result as numbered evidence and validates the closing verdict. The model never sets a number.
import type OpenAI from "openai";
import sharp from "sharp";
import type { FunctionTool, ResponseInputItem, ResponseFunctionToolCall } from "openai/resources/responses/responses";
import { assertAllowedModel, MODELS } from "../meta/models";
import { metaClient, type Effort } from "../albaran/read";
import type { AlbaranLeido, Caja } from "../albaran/schema";
import { normalize } from "../albaran/normalize";
import { aritmeticaLinea, claveProducto, comprobar, inferirIva, precioReferencia, sello } from "../checks/engine";
import type { Albaran, Aviso, Contexto, Sello } from "../checks/types";
import { parsePrinted } from "../numbers";

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
  client?: OpenAI;
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
      description: "Only for celda_mal_leida: the cell text exactly as the re-read evidence shows it.",
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
- "error_proveedor": only after a re-read confirms the printed amount. Cite that evidence.
- "lectura_confirmada": when the warnings are only doubts about a reading (unreadable fields, row count) and independent re-reads of those exact fields agree with the first reading.
- "revisar": when the evidence is unclear or contradictory.
- Prefer the cheapest decisive step. Answer only with tool calls.`;

/** Crop around a 0-1000 box with margins, zoom 2x. Returns JPEG bytes and the pixel rectangle. */
async function recortar(imagen: Buffer, W: number, H: number, caja: Caja, filaCompleta = false) {
  const x0 = (caja.x_min / 1000) * W, x1 = (caja.x_max / 1000) * W;
  const y0 = (caja.y_min / 1000) * H, y1 = (caja.y_max / 1000) * H;
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  // Boxes can be off by about half a text line (measured on day 0): pad generously.
  const padX = filaCompleta ? Math.max(0.02 * W, 0.05 * bw) : Math.max(0.6 * bw, 0.04 * W);
  const padY = Math.max(1.0 * bh, 0.018 * H);
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
  const client = opts.client ?? metaClient();
  assertAllowedModel(MODELS.read);
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
    const caja = l[campo].caja ?? l.caja_fila;
    if (!caja) return { error: "esa celda no tiene caja en el papel" };
    const { zoom, rect, miniatura } = await recortar(imagen, W, H, caja, !l[campo].caja);
    const { out, usage: u } = await preguntarImagen<{ texto: string | null; legible: boolean }>(client, zoom,
      `This is a zoomed crop of a Spanish supplier delivery note, around the ${ETIQUETA[campo]} of product line ${linea}${l.descripcion.texto ? ` ("${l.descripcion.texto}")` : ""}. ` +
        `Copy exactly the ${ETIQUETA[campo]} printed for that line, character by character (keep the comma). Do not compute anything. If you cannot read it with certainty, legible=false.`,
      { type: "object", additionalProperties: false, required: ["texto", "legible"], properties: { texto: { type: ["string", "null"] }, legible: { type: "boolean" } } }, effort);
    sumar(u);
    const ev = nuevaEvidencia({ herramienta: "releer_celda", linea, campo, texto: out.legible ? out.texto : null, recorte: rect, miniatura, datos: { primeraLectura: l[campo].texto, legible: out.legible } });
    return { evidenciaId: ev.id, primera_lectura: l[campo].texto, relectura: ev.texto, legible: out.legible };
  }
  async function releerFila(linea: number) {
    const l = lineaLeida(linea);
    if (!l?.caja_fila) return { error: "esa línea no tiene caja en el papel" };
    const { zoom, rect, miniatura } = await recortar(imagen, W, H, l.caja_fila, true);
    const props: Record<string, unknown> = Object.fromEntries(CAMPOS.map((c) => [c, { type: ["string", "null"] }]));
    props.numeros_en_la_fila = { type: "array", items: { type: "string" } };
    const { out, usage: u } = await preguntarImagen<Record<CampoLinea, string | null> & { numeros_en_la_fila: string[] }>(client, zoom,
      `This is a zoomed crop of one product line of a Spanish supplier delivery note${l.descripcion.texto ? ` ("${l.descripcion.texto}")` : ""}. ` +
        "Copy exactly as printed the quantity the unit price applies to (for goods sold by weight, the weight, not the number of pieces or boxes), the unit price, discount % and line amount (null if not printed). " +
        "Also list every number printed on this line, as printed. Do not compute anything.",
      { type: "object", additionalProperties: false, required: [...CAMPOS, "numeros_en_la_fila"], properties: props }, effort);
    sumar(u);
    const { numeros_en_la_fila: numeros, ...relectura } = out;
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
    const r = await client.responses.create({ model: MODELS.read, reasoning: { effort }, tools: soloCerrar ? TOOLS.filter((t) => t.name === "cerrar") : TOOLS, input });
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

  if (cierre.veredicto === "celda_mal_leida") {
    if (!cierre.correcciones.length) return invalido("sin_correcciones");
    const corregido = structuredClone(leido);
    const reparadas: { linea: number; campo: CampoLinea; antes: string | null; despues: string; evidencia: string }[] = [];
    for (const c of cierre.correcciones) {
      const visto = relecturaDe(c.linea, c.campo);
      const enLaFila = evidencias.some((e) => e.linea === c.linea && e.herramienta === "releer_fila" && ((e.datos?.numeros as string[]) ?? []).some((t) => norm(t) === norm(c.texto)));
      if ((visto == null || norm(visto) !== norm(c.texto)) && !enLaFila) return invalido("correccion_sin_evidencia");
      const l = corregido.lineas[c.linea - 1];
      if (!l) return invalido("linea_inexistente");
      const ev = [...evidencias].reverse().find((e) => e.linea === c.linea && (e.herramienta === "releer_fila" || e.campo === c.campo))!;
      reparadas.push({ linea: c.linea, campo: c.campo, antes: l[c.campo].texto, despues: c.texto, evidencia: ev.id });
      l[c.campo] = { ...l[c.campo], texto: c.texto };
    }
    const a2 = inferirIva(normalize(docId, corregido));
    // The repair is only accepted if every corrected line now adds up.
    if (reparadas.some((r) => !aritmeticaLinea(a2.lineas[r.linea - 1])?.ok)) return invalido("la_correccion_no_cuadra");
    leido = corregido;
    albaran = a2;
    avisos = [
      ...comprobar(albaran, ctx),
      ...reparadas.map((r): Aviso => ({ codigo: "CELDA_REPARADA", clase: "info", docId, lineaIdx: r.linea - 1, centimos: 0, datos: { campo: r.campo, antes: r.antes ?? "", despues: r.despues, evidencia: r.evidencia } })),
    ];
  } else if (cierre.veredicto === "error_proveedor") {
    const confirmados: Record<number, string> = {};
    for (const a of dudas.filter((x) => x.codigo === "ARITMETICA_LINEA" && x.lineaIdx != null)) {
      const n = a.lineaIdx! + 1;
      const l = leido.lineas[a.lineaIdx!];
      const imp = relecturaDe(n, "importe");
      if (imp == null || norm(imp) !== norm(l.importe.texto)) continue; // amount not confirmed on paper
      const q = relecturaDe(n, "cantidad"), p = relecturaDe(n, "precio_unitario");
      if ((q != null && norm(q) !== norm(l.cantidad.texto)) || (p != null && norm(p) !== norm(l.precio_unitario.texto))) continue; // a misread, not a supplier error
      // If any number printed on the row makes the line add up, the quantity was read from another column.
      const filas = evidencias.filter((e) => e.linea === n && e.herramienta === "releer_fila");
      if (filas.some((e) => otraCantidadQueCuadra(n, (e.datos?.numeros as string[]) ?? []))) return invalido("otra_cantidad_impresa_cuadra");
      const ev = [...evidencias].reverse().find((e) => e.linea === n && (e.herramienta === "releer_fila" || e.campo === "importe"))!;
      confirmados[a.lineaIdx!] = ev.id;
    }
    if (!Object.keys(confirmados).length) return invalido("error_no_confirmado_en_el_papel");
    albaran = { ...albaran, confirmados };
    avisos = comprobar(albaran, ctx);
  } else if (cierre.veredicto === "lectura_confirmada") {
    // Every doubt must be matched by an independent re-read that agrees with the first reading.
    const confirmado = (campoIlegible: string): boolean => {
      const m = campoIlegible.match(/l[ií]nea\s*(\d+)\D*?(cantidad|precio|importe|descuento|dto)/i);
      if (m) {
        const n = Number(m[1]);
        const campo: CampoLinea = /precio/i.test(m[2]) ? "precio_unitario" : /descuento|dto/i.test(m[2]) ? "descuento_pct" : (m[2].toLowerCase() as CampoLinea);
        const visto = relecturaDe(n, campo);
        return visto != null && norm(visto) === norm(leido.lineas[n - 1]?.[campo].texto);
      }
      const h = campoIlegible.match(/(total|base|cuota)/i);
      if (h) {
        const c = h[1].toLowerCase();
        const evs = evidencias.filter((e) => e.herramienta === "releer_total" && e.campo?.startsWith(c));
        return evs.length > 0 && evs.every((e) => norm(e.texto) === norm(e.datos?.primeraLectura as string));
      }
      return !CAMPO_DE_DINERO_RE.test(campoIlegible); // non-money doubts do not block the stamp anyway
    };
    const pendientes = albaran.ilegible.filter((c) => !confirmado(c));
    if (pendientes.length) return invalido("dudas_sin_confirmar");
    const recuento = [...evidencias].reverse().find((e) => e.herramienta === "recontar_filas");
    const filas = recuento && recuento.datos?.filas === leido.lineas.length ? leido.lineas.length : albaran.filasContadas;
    if (dudas.some((d) => d.codigo === "RECUENTO_FILAS") && filas !== leido.lineas.length) return invalido("recuento_no_confirmado");
    if (dudas.some((d) => d.codigo === "ARITMETICA_LINEA" || d.codigo === "TOTALES" || d.codigo === "SALTO_RARO")) return invalido("hay_cuentas_que_no_cuadran");
    albaran = { ...albaran, ilegible: [], filasContadas: filas };
    avisos = comprobar(albaran, ctx);
    if (avisos.some((a) => a.clase === "lectura")) return invalido("quedan_dudas");
  } else {
    return { ...base, pasos, evidencias, investigado: true, veredicto: "revisar", valido: true, explicacion: cierre.explicacion, ms: Date.now() - t0, usage };
  }
  return { leido, albaran, avisos, sello: sello(avisos), pasos, evidencias, investigado: true, veredicto: cierre.veredicto, valido: true, explicacion: cierre.explicacion, ms: Date.now() - t0, usage };
}
