// Photo(s) → SAM split → Spark reads each note in parallel → code checks → investigator on doubts
// → claim file on money at stake.
// Emits real progress events as they happen (the screen draws exactly these; no fake progress).
import type OpenAI from "openai";
import { segmentar } from "./segmentar";
import { metaClient, type Effort } from "./albaran/read";
import { normalize } from "./albaran/normalize";
import type { AlbaranLeido } from "./albaran/schema";
import { enJuego } from "./checks/engine";
import type { Aviso, Contexto, Sello } from "./checks/types";
import type { Evidencia, Paso, Veredicto } from "./agente/investigar";
import type { PuntoReclamacion } from "./agente/expediente";
import { analizarDocumento } from "./documento";

export type Etapa = "buscar" | "enderezar" | "leer" | "comprobar" | "investigar" | "reclamar";

export type Evento =
  | { tipo: "etapa"; etapa: Etapa; estado: "inicio" | "fin" | "error"; ms?: number; docId?: string; detalle?: string }
  | { tipo: "foto"; foto: number; width: number; height: number; prompt: string | null }
  | { tipo: "segmento"; foto: number; docId: string; caja: { x: number; y: number; w: number; h: number }; angulo: number; contornoSVG: string | null; confianza: number | null }
  | { tipo: "doc"; docId: string; imagen: string; width: number; height: number }
  | { tipo: "lectura"; docId: string; leido: AlbaranLeido; ms: number }
  | { tipo: "avisos"; docId: string; avisos: Aviso[]; sello: Sello; provisional: boolean }
  | { tipo: "investigacion"; docId: string; pasos: Paso[]; evidencias: Evidencia[]; veredicto: Veredicto | null; valido: boolean; motivo?: string; explicacion?: string; leido: AlbaranLeido; ms: number }
  | { tipo: "expediente"; docId: string; pasos: Paso[]; evidencias: Evidencia[]; puntos: PuntoReclamacion[]; valido: boolean; motivo?: string; explicacion?: string; leido: AlbaranLeido; ms: number }
  | { tipo: "albaran"; docId: string; sello: Sello; proveedor: string | null; numero: string | null; fecha: string | null; totalTexto: string | null }
  | { tipo: "resumen"; sellos: Record<Sello, number>; enJuegoCentimos: number; desglose: ReturnType<typeof enJuego>["desglose"] }
  | { tipo: "error"; codigo: string; mensaje: string; docId?: string }
  | { tipo: "fin"; ms: number; costeUsd: number };

class Cola<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: ((r: IteratorResult<T>) => void)[] = [];
  private closed = false;
  push(x: T) {
    const w = this.waiters.shift();
    if (w) w({ value: x, done: false });
    else this.items.push(x);
  }
  close() {
    this.closed = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined as never, done: true });
  }
  async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.items.length) yield this.items.shift()!;
      else if (this.closed) return;
      else {
        const r = await new Promise<IteratorResult<T>>((res) => this.waiters.push(res));
        if (r.done) return;
        yield r.value;
      }
    }
  }
}

export interface AnalizarOpts {
  client?: OpenAI;
  effort?: Effort;
  investigar?: boolean;
}

export function analizar(fotos: Buffer[], ctx: Contexto, opts: AnalizarOpts = {}): AsyncIterable<Evento> {
  const cola = new Cola<Evento>();
  const client = opts.client ?? metaClient();
  const effort = opts.effort ?? "low";
  const t0 = Date.now();
  let coste = 0;

  (async () => {
    try {
      // 1. Find and straighten every note in every photo.
      cola.push({ tipo: "etapa", etapa: "buscar", estado: "inicio" });
      const docs: { docId: string; jpeg: Buffer }[] = [];
      for (let f = 0; f < fotos.length; f++) {
        const s = await segmentar(fotos[f], { client });
        coste += 0.0025; // SAM list price per image
        cola.push({ tipo: "foto", foto: f, width: s.foto.width, height: s.foto.height, prompt: s.prompt });
        for (const d of s.documentos) {
          const docId = fotos.length > 1 ? `f${f + 1}-${d.docId}` : d.docId;
          cola.push({ tipo: "segmento", foto: f, docId, caja: d.enFoto.caja, angulo: d.enFoto.angulo, contornoSVG: d.enFoto.contornoSVG, confianza: d.confianza });
          docs.push({ docId, jpeg: d.jpeg });
        }
      }
      cola.push({ tipo: "etapa", etapa: "buscar", estado: "fin", ms: Date.now() - t0, detalle: String(docs.length) });
      if (!docs.length) {
        cola.push({ tipo: "error", codigo: "SIN_ALBARANES", mensaje: "No veo ningún albarán" });
        return;
      }

      // 2. Read, check and investigate every note in parallel.
      const finales: { sello: Sello; avisos: Aviso[] }[] = [];
      await Promise.all(
        docs.map(async ({ docId, jpeg }) => {
          try {
            cola.push({ tipo: "etapa", etapa: "leer", estado: "inicio", docId });
            const res = await analizarDocumento(docId, jpeg, ctx, { client, effort, investigar: opts.investigar, emitir: (ev) => cola.push(ev) });
            coste += res.costeUsd;
            const { leido, sello: st, avisos } = res;
            const a = normalize(docId, leido);
            cola.push({ tipo: "albaran", docId, sello: st, proveedor: a.proveedor, numero: a.numero, fecha: a.fecha, totalTexto: leido.total.texto });
            finales.push({ sello: st, avisos });
          } catch (e) {
            cola.push({ tipo: "error", codigo: "LECTURA", mensaje: (e as Error).message.slice(0, 200), docId });
          }
        }),
      );

      const todos = finales.flatMap((f) => f.avisos);
      const ej = enJuego(todos);
      const sellos = { CONFORME: 0, CON_RESERVAS: 0, REVISAR: 0 } as Record<Sello, number>;
      for (const f of finales) sellos[f.sello]++;
      cola.push({ tipo: "resumen", sellos, enJuegoCentimos: ej.totalCents, desglose: ej.desglose });
    } catch (e) {
      cola.push({ tipo: "error", codigo: "ANALISIS", mensaje: (e as Error).message.slice(0, 200) });
    } finally {
      cola.push({ tipo: "fin", ms: Date.now() - t0, costeUsd: Math.round(coste * 10000) / 10000 });
      cola.close();
    }
  })();

  return cola;
}
