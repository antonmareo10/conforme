// The proof strip on the landing page: the latest measured aggregate on the real set, or nothing.
// Never a number that was not measured.
import aggregate from "../../eval/results/real-R-latest.json";

export interface Prueba {
  albaranes: number;
  pctCentimo: number;
  okSilencioso: number;
  fecha: string;
}

export function pruebaReal(): Prueba | null {
  const a = aggregate as { albaranes?: number; lineas_al_centimo?: { pct: number | null }; ok_silencioso?: number; fecha?: string } | null;
  if (!a?.albaranes || a.lineas_al_centimo?.pct == null || a.ok_silencioso == null || !a.fecha) return null;
  return { albaranes: a.albaranes, pctCentimo: a.lineas_al_centimo.pct, okSilencioso: a.ok_silencioso, fecha: a.fecha };
}
