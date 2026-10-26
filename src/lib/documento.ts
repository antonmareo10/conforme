// One delivery note, end to end. Used by the app (with events) and by the evaluator (without), so the
// numbers we publish come from exactly what the product does.
//   read → second independent reading of the table (boxes snapped to rows, disagreements flagged)
//   → code checks → investigator on notes with doubts → claim file on notes with money at stake
//   (every number a claim rests on confirmed on the paper) → final stamp.
import type { ResponsesClient } from "./meta/privado";
import { readAlbaran, costUsd, type Effort, type ReadResult } from "./albaran/read";
import { normalize } from "./albaran/normalize";
import { afinarCajas, compararLecturas, localizarFilas, repararCajas } from "./albaran/localizar";
import { enderezarLectura } from "./albaran/rotar";
import type { AlbaranLeido } from "./albaran/schema";
import { comprobar, inferirIva, sello } from "./checks/engine";
import type { Aviso, Contexto, Sello } from "./checks/types";
import { investigar, type Investigacion } from "./agente/investigar";
import { necesitaExpediente, prepararReclamacion, type Expediente } from "./agente/expediente";
import type { Evento } from "./pipeline";

export interface ResultadoDocumento {
  leido: AlbaranLeido;
  avisos: Aviso[];
  sello: Sello;
  inv: Investigacion | null;
  exp: Expediente | null;
  costeUsd: number;
  /** Cells where the two independent readings disagreed (before any investigation). */
  discrepancias: number;
  ms: { lectura: number; segunda: number; investigacion: number; expediente: number };
  imagen: Buffer;
  width: number;
  height: number;
}

export async function analizarDocumento(
  docId: string,
  foto: Buffer,
  ctx: Contexto,
  opts: { client?: ResponsesClient; effort?: Effort; investigar?: boolean; reclamar?: boolean; segundaLectura?: boolean; previa?: ReadResult; emitir?: (ev: Evento) => void } = {},
): Promise<ResultadoDocumento> {
  const emit = opts.emitir ?? (() => {});
  const effort = opts.effort ?? "low";
  let coste = 0;
  const r = opts.previa ?? (await readAlbaran(foto, { client: opts.client, effort }));
  if (!opts.previa) coste += costUsd(r.usage);
  // Upright first: boxes rotate with the page.
  const derecho = await enderezarLectura(r.imagen!, r.leido);
  const imagen = derecho.imagen;

  let leido: AlbaranLeido = repararCajas(derecho.leido);
  let msSegunda = 0;
  if (opts.segundaLectura !== false && leido.lineas.length) {
    try {
      const loc = await localizarFilas(imagen, leido, { client: opts.client, effort });
      coste += costUsd({ input_tokens: loc.usage?.input_tokens ?? 0, output_tokens: loc.usage?.output_tokens ?? 0, reasoning_tokens: 0 });
      leido = { ...afinarCajas(leido, loc), discrepancias: compararLecturas(leido, loc) };
      msSegunda = loc.ms;
    } catch {
      /* keep the first reading and its own boxes */
    }
  }
  emit({ tipo: "doc", docId, imagen: `data:image/jpeg;base64,${imagen.toString("base64")}`, width: derecho.width, height: derecho.height });
  emit({ tipo: "lectura", docId, leido, ms: r.ms + msSegunda });
  emit({ tipo: "etapa", etapa: "leer", estado: "fin", docId, ms: r.ms + msSegunda });

  const discrepancias = leido.discrepancias?.length ?? 0;
  let avisos = comprobar(inferirIva(normalize(docId, leido)), ctx);
  let st = sello(avisos);
  const reclamar = opts.investigar !== false && opts.reclamar !== false;
  emit({ tipo: "avisos", docId, avisos, sello: st, provisional: st === "REVISAR" || (reclamar && necesitaExpediente(avisos)) });

  let inv: Investigacion | null = null;
  if (st === "REVISAR" && opts.investigar !== false) {
    emit({ tipo: "etapa", etapa: "investigar", estado: "inicio", docId });
    inv = await investigar(docId, leido, imagen, ctx, { client: opts.client, effort });
    coste += costUsd({ ...inv.usage, reasoning_tokens: 0 });
    leido = inv.leido;
    avisos = inv.avisos;
    st = inv.sello;
    emit({ tipo: "investigacion", docId, pasos: inv.pasos, evidencias: inv.evidencias, veredicto: inv.veredicto, valido: inv.valido, motivo: inv.motivo, explicacion: inv.explicacion, leido, ms: inv.ms });
    emit({ tipo: "avisos", docId, avisos, sello: st, provisional: reclamar && necesitaExpediente(avisos) });
    emit({ tipo: "etapa", etapa: "investigar", estado: "fin", docId, ms: inv.ms });
  }

  // Money asked of a supplier: the agent confirms on the paper every number the claim rests on.
  let exp: Expediente | null = null;
  if (reclamar && necesitaExpediente(avisos)) {
    emit({ tipo: "etapa", etapa: "reclamar", estado: "inicio", docId });
    exp = await prepararReclamacion(docId, leido, imagen, ctx, avisos, { client: opts.client, effort, primeraEvidencia: (inv?.evidencias.length ?? 0) + 1 });
    coste += costUsd({ ...exp.usage, reasoning_tokens: 0 });
    leido = exp.leido;
    avisos = exp.avisos;
    st = exp.sello;
    emit({ tipo: "expediente", docId, pasos: exp.pasos, evidencias: exp.evidencias, puntos: exp.puntos, valido: exp.valido, motivo: exp.motivo, explicacion: exp.explicacion, leido, ms: exp.ms });
    emit({ tipo: "avisos", docId, avisos, sello: st, provisional: false });
    emit({ tipo: "etapa", etapa: "reclamar", estado: "fin", docId, ms: exp.ms });
  }
  return { leido, avisos, sello: st, inv, exp, costeUsd: coste, discrepancias, ms: { lectura: r.ms, segunda: msSegunda, investigacion: inv?.ms ?? 0, expediente: exp?.ms ?? 0 }, imagen, width: derecho.width, height: derecho.height };
}
