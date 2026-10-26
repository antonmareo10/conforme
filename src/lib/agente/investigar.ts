// The investigator: Muse Spark decides what to look at on the paper, with tools; code runs every tool,
// keeps every result as numbered evidence and validates the closing verdict. The model never sets a number.
import sharp from "sharp";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { readerModel } from "../meta/models";
import type { ResponsesClient } from "../meta/privado";
import { readerClient, type Effort } from "../albaran/read";
import type { AlbaranLeido } from "../albaran/schema";
import { normalize } from "../albaran/normalize";
import { aritmeticaLinea, comprobar, inferirIva, sello } from "../checks/engine";
import type { Albaran, Aviso, Contexto, Sello } from "../checks/types";
import { mismoNumero } from "../albaran/localizar";
import { bucleAgente, CAMPOS, HERRAMIENTAS, mesaDeTrabajo, norm, tool, type CampoLinea, type Evidencia, type Paso } from "./herramientas";

export type { CampoLinea, CampoCabecera, Evidencia, Paso } from "./herramientas";

export type Veredicto = "error_proveedor" | "celda_mal_leida" | "lectura_confirmada" | "revisar";

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

const CERRAR = tool("cerrar", "Close the investigation. Cite the evidence ids that support the verdict. Code will verify everything.", {
    veredicto: { type: "string", enum: ["error_proveedor", "celda_mal_leida", "lectura_confirmada", "revisar"] },
    evidencias: { type: "array", items: { type: "string" } },
    correcciones: {
      type: "array",
      description: "Cells whose re-read shows a different value from the first reading: the text exactly as the re-read evidence shows it. Allowed with celda_mal_leida and error_proveedor.",
      items: { type: "object", additionalProperties: false, required: ["linea", "campo", "texto"], properties: { linea: { type: "integer" }, campo: { type: "string", enum: CAMPOS }, texto: { type: "string" } } },
    },
    explicacion: { type: "string", description: "One short sentence for the restaurant owner, in Spanish, without numbers you did not see in the evidence." },
  }, ["veredicto", "evidencias", "correcciones", "explicacion"]);

const CAMPO_DE_DINERO_RE = /cantidad|precio|importe|base|cuota|total|iva|descuento|dto|unidades|peso/i;

const INSTRUCCIONES = `You are the investigator of Conforme, an app that checks supplier delivery notes for a restaurant before anyone signs them.
Code already read the note and found warnings it cannot resolve alone. Decide what to look at on the paper, using at most {MAX} tool calls, then call "cerrar".
Rules:
- Code computed every number in the warnings. Never compute or invent amounts; code re-checks everything you say.
- A line that does not add up is either a misread cell (a re-read shows a different value that makes it add up) or a supplier error (re-reading the printed amount, and ideally the quantity or price, confirms what was read first).
- "celda_mal_leida": give the corrected text exactly as the re-read evidence shows it (a value from the row's list of printed numbers is fine), and cite that evidence.
- If a tool result carries "nota_del_codigo", take it into account: code found a printed number that makes the line add up.
- Warnings with motivo "dos_lecturas": two independent readings of that cell disagree (primera / segunda). Re-read that exact cell zoomed. If the zoomed re-read differs from the first reading, put it in "correcciones". If after correcting the line no longer adds up, re-read the line amount too: a confirmed printed amount that does not match quantity x price is a supplier error.
- Warnings with motivo "dos_lecturas" on the total or on a VAT base or amount: re-read that number zoomed with releer_total. Code settles it with the re-read.
- "error_proveedor": only after a re-read confirms the printed amount. Cite that evidence.
- "lectura_confirmada": when the warnings are only doubts about a reading (unreadable fields, row count) and independent re-reads of those exact fields agree with the first reading.
- "revisar": when the evidence is unclear or contradictory.
- Prefer the cheapest decisive step. Answer only with tool calls.`;

export async function investigar(
  docId: string,
  leidoOriginal: AlbaranLeido,
  imagen: Buffer,
  ctx: Contexto,
  opts: InvestigarOpts = {},
): Promise<Investigacion> {
  const t0 = Date.now();
  const client = opts.client ?? readerClient();
  readerModel(); // allowlist check before any call
  const effort = opts.effort ?? "low";
  const maxLlamadas = opts.maxLlamadas ?? 4;
  const maxMs = opts.maxMs ?? 45_000;
  const { width: W = 0, height: H = 0 } = await sharp(imagen).metadata();
  const usage = { input_tokens: 0, output_tokens: 0 };

  let leido: AlbaranLeido = structuredClone(leidoOriginal);
  let albaran = inferirIva(normalize(docId, leido));
  let avisos = comprobar(albaran, ctx);
  const dudas = avisos.filter((a) => a.clase === "lectura");
  const base = { leido, albaran, avisos, sello: sello(avisos), pasos: [] as Paso[], evidencias: [] as Evidencia[], ms: 0, usage };
  if (!dudas.length) return { ...base, investigado: false, veredicto: null, valido: true, ms: Date.now() - t0 };

  const mesa = mesaDeTrabajo({ docId, leido, albaran, imagen, W, H, ctx, client, effort, usage });
  const { evidencias, otraCantidadQueCuadra, relecturaDe } = mesa;

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
  const herramientas = ["releer_celda", "releer_fila", "historial_precio", "pedido", "releer_total", "recontar_filas"].map((n) => HERRAMIENTAS[n]);
  const { cierre, pasos } = await bucleAgente<Cierre>({ client, effort, input, herramientas, cierre: CERRAR, mesa, maxLlamadas, maxMs, t0 });

  // ---- code validates the verdict ----
  const invalido = (motivo: string): Investigacion => ({ ...base, leido: leidoOriginal, pasos, evidencias, investigado: true, veredicto: cierre?.veredicto ?? null, valido: false, motivo, explicacion: cierre?.explicacion, ms: Date.now() - t0, usage });
  if (!cierre) return invalido("sin_cierre");
  const citadas = cierre.evidencias.map((id) => evidencias.find((e) => e.id === id));
  if (citadas.some((e) => !e)) return invalido("cita_evidencias_inexistentes");
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

  // 3b. The total or a VAT row read differently twice: a zoomed re-read that agrees with the first reading
  //     settles it; one that agrees with the second means two independent readings against the first, and
  //     code takes their value. Anything else stays a doubt.
  const reparadasCabecera: { campo: string; antes: string | null; despues: string; evidencia: string }[] = [];
  corregido.discrepancias_cabecera = (corregido.discrepancias_cabecera ?? []).filter((d) => {
    const etiqueta = d.campo === "total" ? "total" : `${d.campo} ${d.fila}`;
    const ev = [...evidencias].reverse().find((e) => e.herramienta === "releer_total" && e.campo === etiqueta && e.texto != null);
    if (!ev) return true;
    if (mismoNumero(ev.texto!, d.primera)) return false;
    if (d.segunda != null && mismoNumero(ev.texto!, d.segunda)) {
      const f = d.campo === "total" ? corregido.total : corregido.impuestos[d.fila - 1]?.[d.campo];
      if (!f) return true;
      reparadasCabecera.push({ campo: etiqueta, antes: f.texto, despues: ev.texto!, evidencia: ev.id });
      f.texto = ev.texto!;
      return false;
    }
    return true;
  });
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
    if (!reparadas.length && !reparadasCabecera.length) return invalido("sin_correcciones");
    if (reparadas.some((r) => !aritmeticaLinea(a2.lineas[r.linea - 1])?.ok)) return invalido("la_correccion_no_cuadra");
  }
  if (cierre.veredicto === "error_proveedor" && !Object.keys(confirmados).length) return invalido("error_no_confirmado_en_el_papel");

  leido = corregido;
  albaran = { ...a2, confirmados };
  avisos = [
    ...comprobar(albaran, ctx),
    ...reparadas.map((r): Aviso => ({ codigo: "CELDA_REPARADA", clase: "info", docId, lineaIdx: r.linea - 1, centimos: 0, datos: { campo: r.campo, antes: r.antes ?? "", despues: r.despues, evidencia: r.evidencia } })),
    ...reparadasCabecera.map((r): Aviso => ({ codigo: "CELDA_REPARADA", clase: "info", docId, centimos: 0, datos: { campo: r.campo, antes: r.antes ?? "", despues: r.despues, evidencia: r.evidencia } })),
  ];
  if (cierre.veredicto === "lectura_confirmada" && avisos.some((a) => a.clase === "lectura")) return invalido("quedan_dudas");
  return { leido, albaran, avisos, sello: sello(avisos), pasos, evidencias, investigado: true, veredicto: cierre.veredicto, valido: true, explicacion: cierre.explicacion, ms: Date.now() - t0, usage };
}
