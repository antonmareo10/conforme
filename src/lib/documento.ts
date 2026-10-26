// One delivery note, end to end. Used by the app (with events) and by the evaluator (without), so the
// numbers we publish come from exactly what the product does.
//   read → second independent reading of the table (boxes snapped to rows, disagreements flagged)
//   → code checks → investigator on notes with doubts → final stamp.
import type OpenAI from "openai";
import { readAlbaran, costUsd, type Effort, type ReadResult } from "./albaran/read";
import { normalize } from "./albaran/normalize";
import { afinarCajas, compararLecturas, localizarFilas } from "./albaran/localizar";
import { enderezarLectura } from "./albaran/rotar";
import type { AlbaranLeido } from "./albaran/schema";
import { comprobar, inferirIva, sello } from "./checks/engine";
import type { Aviso, Contexto, Sello } from "./checks/types";
import { investigar, type Investigacion } from "./agente/investigar";
import type { Evento } from "./pipeline";

export interface ResultadoDocumento {
  leido: AlbaranLeido;
  avisos: Aviso[];
  sello: Sello;
  inv: Investigacion | null;
  costeUsd: number;
  /** Cells where the two independent readings disagreed (before any investigation). */
  discrepancias: number;
  ms: { lectura: number; segunda: number; investigacion: number };
  imagen: Buffer;
  width: number;
  height: number;
}

export async function analizarDocumento(
  docId: string,
  foto: Buffer,
  ctx: Contexto,
  opts: { client?: OpenAI; effort?: Effort; investigar?: boolean; segundaLectura?: boolean; previa?: ReadResult; emitir?: (ev: Evento) => void } = {},
): Promise<ResultadoDocumento> {
  const emit = opts.emitir ?? (() => {});
  const effort = opts.effort ?? "low";
  let coste = 0;
  const r = opts.previa ?? (await readAlbaran(foto, { client: opts.client, effort }));
  if (!opts.previa) coste += costUsd(r.usage);
  // Upright first: boxes rotate with the page.
  const derecho = await enderezarLectura(r.imagen!, r.leido);
  const imagen = derecho.imagen;

  let leido: AlbaranLeido = derecho.leido;
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
  emit({ tipo: "avisos", docId, avisos, sello: st, provisional: st === "REVISAR" });

  let inv: Investigacion | null = null;
  if (st === "REVISAR" && opts.investigar !== false) {
    emit({ tipo: "etapa", etapa: "investigar", estado: "inicio", docId });
    inv = await investigar(docId, leido, imagen, ctx, { client: opts.client, effort });
    coste += costUsd({ ...inv.usage, reasoning_tokens: 0 });
    leido = inv.leido;
    avisos = inv.avisos;
    st = inv.sello;
    emit({ tipo: "investigacion", docId, pasos: inv.pasos, evidencias: inv.evidencias, veredicto: inv.veredicto, valido: inv.valido, motivo: inv.motivo, explicacion: inv.explicacion, leido, ms: inv.ms });
    emit({ tipo: "avisos", docId, avisos, sello: st, provisional: false });
    emit({ tipo: "etapa", etapa: "investigar", estado: "fin", docId, ms: inv.ms });
  }
  return { leido, avisos, sello: st, inv, costeUsd: coste, discrepancias, ms: { lectura: r.ms, segunda: msSegunda, investigacion: inv?.ms ?? 0 }, imagen, width: derecho.width, height: derecho.height };
}
