// The proof strip on the landing page: the latest measured aggregate on the real set, or nothing.
// Never a number that was not measured. With repeated runs of the current version, their mean.
import aggregate from "../../eval/results/real-R-latest.json";

export interface Prueba {
  albaranes: number;
  pctCentimo: number;
  /** Silent OKs, worst run. */
  okSilencioso: number;
  pasadas: number;
  fecha: string;
}

export function pruebaReal(): Prueba | null {
  const a = aggregate as {
    albaranes?: number; lineas_al_centimo?: { pct: number | null }; ok_silencioso?: number; fecha?: string;
    repeticiones?: { pasadas: number; lineas_al_centimo: { pct: number }; ok_silencioso: number[] };
  } | null;
  if (!a?.albaranes || a.lineas_al_centimo?.pct == null || a.ok_silencioso == null || !a.fecha) return null;
  const r = a.repeticiones;
  return {
    albaranes: a.albaranes,
    pctCentimo: r ? r.lineas_al_centimo.pct : a.lineas_al_centimo.pct,
    okSilencioso: r ? Math.max(...r.ok_silencioso) : a.ok_silencioso,
    pasadas: r?.pasadas ?? 1,
    fecha: a.fecha,
  };
}
