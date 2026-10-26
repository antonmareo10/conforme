// Recorded runs, fetched once per page and shared (the landing scene and the case file use the same one).
import type { Evento } from "../pipeline";
import { reducir, sesionVacia, type SesionEstado } from "./estado";

export interface ReplayGrabado { id: string; grabado: string; eventos: { t: number; ev: Evento }[] }

const cache = new Map<string, Promise<ReplayGrabado>>();
export function cargarReplay(id: string): Promise<ReplayGrabado> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/replays/${id}.json`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<ReplayGrabado>; });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

/** The final state of a recorded run (every event applied). */
export const estadoFinal = (r: ReplayGrabado): SesionEstado => r.eventos.reduce((s, e) => reducir(s, e.ev), sesionVacia());
