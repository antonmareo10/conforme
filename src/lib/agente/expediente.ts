// The claim file: before Conforme asks a supplier for money, the agent has to put the evidence on the
// table. Muse Spark picks what to re-read on the paper and which records to pull; code decides what
// counts as evidence. A claim goes out only if every printed number it rests on was confirmed by an
// independent zoomed re-read. If a re-read contradicts the first reading, the claim is held back and
// the note goes to a person.
import sharp from "sharp";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { readerModel } from "../meta/models";
import type { ResponsesClient } from "../meta/privado";
import { readerClient, type Effort } from "../albaran/read";
import type { AlbaranLeido } from "../albaran/schema";
import { normalize } from "../albaran/normalize";
import { mismoNumero } from "../albaran/localizar";
import { aritmeticaLinea, inferirIva, sello } from "../checks/engine";
import type { Aviso, Contexto, Sello } from "../checks/types";
import { bucleAgente, HERRAMIENTAS, mesaDeTrabajo, tool, type CampoLinea, type Evidencia, type Paso } from "./herramientas";

/** Money warnings whose claim rests on numbers printed on this paper (the rest are confirmed elsewhere). */
export const A_CONFIRMAR = new Set<Aviso["codigo"]>(["SUBIDA", "FALTA"]);
export const necesitaExpediente = (avisos: Aviso[]) => avisos.some((a) => A_CONFIRMAR.has(a.codigo) && a.centimos > 0 && a.lineaIdx != null && a.datos.evidencia == null);

/** Which printed cells each kind of claim rests on. */
const CELDAS: Partial<Record<Aviso["codigo"], ("cantidad" | "precio_unitario")[]>> = { SUBIDA: ["precio_unitario", "cantidad"], FALTA: ["cantidad"] };
const REGISTRO: Partial<Record<Aviso["codigo"], "historial_precio" | "pedido">> = { SUBIDA: "historial_precio", FALTA: "pedido" };

export type EstadoReclamacion = "confirmada" | "retenida" | "sin_confirmar";

export interface PuntoReclamacion {
  codigo: Aviso["codigo"];
  lineaIdx: number;
  estado: EstadoReclamacion;
  /** Re-read evidence that confirms (or contradicts) the printed numbers. */
  evidencias: string[];
  /** The record the claim is compared against (price history or order), always pulled by code. */
  registro?: string;
  /** When held back: the cell, what the first reading said and what the re-read shows. */
  contradiccion?: { campo: "cantidad" | "precio_unitario"; primera: string | null; relectura: string | null };
}

export interface Expediente {
  preparado: boolean;
  leido: AlbaranLeido;
  avisos: Aviso[];
  sello: Sello;
  pasos: Paso[];
  evidencias: Evidencia[];
  puntos: PuntoReclamacion[];
  valido: boolean;
  motivo?: string;
  explicacion?: string;
  ms: number;
  usage: { input_tokens: number; output_tokens: number };
}

const CERRAR = tool("cerrar_expediente", "Close the claim file. For every claim, cite the evidence ids that support it. Code will verify everything.", {
  reclamaciones: {
    type: "array",
    items: { type: "object", additionalProperties: false, required: ["n", "evidencias"], properties: { n: { type: "integer", description: "claim number as listed" }, evidencias: { type: "array", items: { type: "string" } } } },
  },
  explicacion: { type: "string", description: "One short sentence for the restaurant owner, in Spanish, without numbers you did not see in the evidence." },
}, ["reclamaciones", "explicacion"]);

const INSTRUCCIONES = `You prepare the claim file of Conforme, an app that checks supplier delivery notes for a restaurant before anyone signs them.
Code found money at stake on this note and will write the claim to the supplier. Before anyone asks a supplier for money, every printed number the claim rests on must be confirmed on the paper by an independent zoomed re-read, and the record it is compared against must be on file. Use at most {MAX} tool calls, then call "cerrar_expediente".
Rules:
- SUBIDA (price rise): re-read that line zoomed (releer_fila) to confirm the unit price and the quantity exactly as printed, and pull historial_precio for that line.
- FALTA (shortage): re-read that line zoomed (releer_fila) to confirm the delivered quantity exactly as printed, and pull pedido for that line.
- Code computed every amount. Never compute or invent numbers; code re-checks every evidence you cite.
- If a re-read shows a different number from the first reading, do not hide it: cite it anyway; code will hold that claim back.
- Call independent tools in the same turn when you can. Answer only with tool calls.`;

export interface ExpedienteOpts {
  client?: ResponsesClient;
  effort?: Effort;
  maxLlamadas?: number;
  maxMs?: number;
  /** First evidence number (after the investigator's, so ids stay unique on the note). */
  primeraEvidencia?: number;
}

export async function prepararReclamacion(
  docId: string,
  leidoEntrada: AlbaranLeido,
  imagen: Buffer,
  ctx: Contexto,
  avisosEntrada: Aviso[],
  opts: ExpedienteOpts = {},
): Promise<Expediente> {
  const t0 = Date.now();
  const usage = { input_tokens: 0, output_tokens: 0 };
  const leido = structuredClone(leidoEntrada);
  const reclamaciones = avisosEntrada.filter((a) => A_CONFIRMAR.has(a.codigo) && a.centimos > 0 && a.lineaIdx != null && a.datos.evidencia == null);
  const vacio = { leido, avisos: avisosEntrada, sello: sello(avisosEntrada), pasos: [] as Paso[], evidencias: [] as Evidencia[], puntos: [] as PuntoReclamacion[], usage };
  if (!reclamaciones.length) return { ...vacio, preparado: false, valido: true, ms: 0 };

  const client = opts.client ?? readerClient();
  readerModel(); // allowlist check before any call
  const effort = opts.effort ?? "low";
  const maxLlamadas = opts.maxLlamadas ?? 4;
  const maxMs = opts.maxMs ?? 40_000;
  const { width: W = 0, height: H = 0 } = await sharp(imagen).metadata();
  const albaran = inferirIva(normalize(docId, leido));
  const mesa = mesaDeTrabajo({ docId, leido, albaran, imagen, W, H, ctx, client, effort, usage, primeraEvidencia: opts.primeraEvidencia });
  const { evidencias, relecturaDe } = mesa;

  const resumen = {
    proveedor: albaran.proveedor,
    numero: albaran.numero,
    fecha: albaran.fecha,
    lineas: leido.lineas.map((l, i) => ({ n: i + 1, descripcion: l.descripcion.texto, cantidad: l.cantidad.texto, unidad: l.unidad, precio_unitario: l.precio_unitario.texto, importe: l.importe.texto })),
    reclamaciones: reclamaciones.map((a, i) => ({ n: i + 1, codigo: a.codigo, linea: a.lineaIdx! + 1, centimos_calculados_por_codigo: a.centimos, datos_calculados_por_codigo: a.datos })),
  };
  const input: ResponseInputItem[] = [
    { role: "developer", content: INSTRUCCIONES.replace("{MAX}", String(maxLlamadas)) },
    { role: "user", content: JSON.stringify(resumen) },
  ];
  type Cierre = { reclamaciones: { n: number; evidencias: string[] }[]; explicacion: string };
  const herramientas = ["releer_fila", "releer_celda", "historial_precio", "pedido"].map((n) => HERRAMIENTAS[n]);
  const { cierre, pasos } = await bucleAgente<Cierre>({ client, effort, input, herramientas, cierre: CERRAR, mesa, maxLlamadas, maxMs, t0 });

  // ---- code decides what counts as evidence ----
  const citaInexistente = !!cierre?.reclamaciones?.some((r) => r.evidencias.some((id) => !evidencias.some((e) => e.id === id)));
  const valido = !!cierre && !citaInexistente;
  const puntos: PuntoReclamacion[] = reclamaciones.map((a, i) => {
    const linea = a.lineaIdx! + 1;
    const lt = leido.lineas[a.lineaIdx!];
    const citadas = valido ? cierre!.reclamaciones.find((r) => r.n === i + 1)?.evidencias ?? [] : [];
    // The record is code data: if the agent did not pull it, code attaches it, so the file is complete.
    const tipoRegistro = REGISTRO[a.codigo];
    let registro = tipoRegistro ? evidencias.find((e) => e.herramienta === tipoRegistro && e.linea === linea)?.id : undefined;
    if (tipoRegistro && !registro) registro = (tipoRegistro === "pedido" ? mesa.pedido(linea) : mesa.historial(linea)).evidenciaId;

    const relecturas = evidencias.filter((e) => e.linea === linea && (e.herramienta === "releer_fila" || e.herramienta === "releer_celda"));
    // A contradiction counts even if the agent did not cite it: a re-read that disagrees blocks the claim.
    for (const campo of CELDAS[a.codigo] ?? []) {
      const visto = relecturaDe(linea, campo);
      if (visto != null && !mismoNumero(visto, lt[campo].texto)) {
        return { codigo: a.codigo, lineaIdx: a.lineaIdx!, estado: "retenida", evidencias: relecturas.map((e) => e.id), registro, contradiccion: { campo, primera: lt[campo].texto, relectura: visto } };
      }
    }
    if (!valido) return { codigo: a.codigo, lineaIdx: a.lineaIdx!, estado: "sin_confirmar", evidencias: [], registro };
    // Confirmed: the cited re-reads show every cell the claim rests on, as first read. For a price rise the
    // quantity may instead be backed by the line adding up (quantity × price = printed amount).
    const citadasRelectura = relecturas.filter((e) => citadas.includes(e.id));
    const vistoEnCitadas = (campo: CampoLinea) => citadasRelectura.some((e) => {
      const t = e.herramienta === "releer_celda" ? (e.campo === campo ? e.texto : undefined) : (e.datos?.relectura as Record<string, string | null> | undefined)?.[campo];
      return t != null && mismoNumero(t, lt[campo].texto);
    });
    const cuadra = !!aritmeticaLinea(albaran.lineas[a.lineaIdx!])?.ok;
    const necesarias = (CELDAS[a.codigo] ?? []).filter((c) => !(a.codigo === "SUBIDA" && c === "cantidad" && cuadra));
    const ok = necesarias.every(vistoEnCitadas);
    return { codigo: a.codigo, lineaIdx: a.lineaIdx!, estado: ok ? "confirmada" : "sin_confirmar", evidencias: ok ? citadasRelectura.map((e) => e.id) : [], registro };
  });

  // ---- the warnings after the file: confirmed claims carry their evidence; held-back claims become doubts ----
  const avisos: Aviso[] = [];
  for (const a of avisosEntrada) {
    const p = puntos.find((x) => x.codigo === a.codigo && x.lineaIdx === a.lineaIdx);
    if (!p) { avisos.push(a); continue; }
    if (p.estado === "retenida") {
      const c = p.contradiccion!;
      avisos.push({ codigo: "ILEGIBLE", clase: "lectura", docId, lineaIdx: a.lineaIdx, centimos: 0, datos: { campo: `linea ${a.lineaIdx! + 1} ${c.campo}`, motivo: "relectura_distinta", primera: c.primera ?? "", segunda: c.relectura ?? "" } });
      leido.discrepancias = [...(leido.discrepancias ?? []), { linea: a.lineaIdx! + 1, campo: c.campo, primera: c.primera, segunda: c.relectura }];
      continue;
    }
    avisos.push({ ...a, datos: { ...a.datos, ...(p.estado === "confirmada" ? { evidencia: p.evidencias[0] } : { sinConfirmar: 1 }), ...(p.registro ? { registro: p.registro } : {}) } });
  }

  return {
    preparado: true, leido, avisos, sello: sello(avisos), pasos, evidencias, puntos, valido,
    motivo: !cierre ? "sin_cierre" : citaInexistente ? "cita_evidencias_inexistentes" : undefined,
    explicacion: cierre?.explicacion, ms: Date.now() - t0, usage,
  };
}
