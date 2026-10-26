// Session state built only from pipeline events (live or recorded). Pure, so it can be tested.
import type { Evento, Etapa } from "../pipeline";
import type { AlbaranLeido } from "../albaran/schema";
import type { Aviso, Sello } from "../checks/types";
import type { Evidencia, Paso, Veredicto } from "../agente/investigar";
import type { PuntoReclamacion } from "../agente/expediente";

export interface DocEstado {
  docId: string;
  foto?: number;
  caja?: { x: number; y: number; w: number; h: number };
  angulo?: number;
  contornoSVG?: string | null;
  imagen?: string;
  width?: number;
  height?: number;
  leido?: AlbaranLeido;
  leidoMs?: number;
  avisos: Aviso[];
  sello?: Sello;
  provisional?: boolean;
  investigacion?: { pasos: Paso[]; evidencias: Evidencia[]; veredicto: Veredicto | null; valido: boolean; motivo?: string; explicacion?: string; ms: number };
  investigando?: boolean;
  /** The claim file: what the agent re-read before any money is asked of the supplier. */
  expediente?: { pasos: Paso[]; evidencias: Evidencia[]; puntos: PuntoReclamacion[]; valido: boolean; motivo?: string; explicacion?: string; ms: number };
  reclamando?: boolean;
  leyendo?: boolean;
  proveedor?: string | null;
  numero?: string | null;
  fecha?: string | null;
  totalTexto?: string | null;
  error?: string;
}

export interface SesionEstado {
  fotos: { width: number; height: number; prompt: string | null }[];
  docs: Record<string, DocEstado>;
  orden: string[];
  etapas: Partial<Record<Etapa, { estado: "inicio" | "fin" | "error"; ms?: number; detalle?: string }>>;
  resumen?: Extract<Evento, { tipo: "resumen" }>;
  errores: { codigo: string; mensaje: string; docId?: string }[];
  fin?: { ms: number; costeUsd: number };
}

export const sesionVacia = (): SesionEstado => ({ fotos: [], docs: {}, orden: [], etapas: {}, errores: [] });

function doc(s: SesionEstado, docId: string): [SesionEstado, DocEstado] {
  const d = s.docs[docId] ?? { docId, avisos: [] };
  const orden = s.orden.includes(docId) ? s.orden : [...s.orden, docId];
  return [{ ...s, orden }, d];
}
const con = (s: SesionEstado, d: DocEstado): SesionEstado => ({ ...s, docs: { ...s.docs, [d.docId]: d } });

export function reducir(s: SesionEstado, ev: Evento): SesionEstado {
  switch (ev.tipo) {
    case "etapa": {
      if (ev.docId) {
        const [s2, d] = doc(s, ev.docId);
        if (ev.etapa === "leer") return con(s2, { ...d, leyendo: ev.estado === "inicio" });
        if (ev.etapa === "investigar") return con(s2, { ...d, investigando: ev.estado === "inicio" });
        if (ev.etapa === "reclamar") return con(s2, { ...d, reclamando: ev.estado === "inicio" });
        return s2;
      }
      return { ...s, etapas: { ...s.etapas, [ev.etapa]: { estado: ev.estado, ms: ev.ms, detalle: ev.detalle } } };
    }
    case "foto": {
      const fotos = [...s.fotos];
      fotos[ev.foto] = { width: ev.width, height: ev.height, prompt: ev.prompt };
      return { ...s, fotos };
    }
    case "segmento": {
      const [s2, d] = doc(s, ev.docId);
      return con(s2, { ...d, foto: ev.foto, caja: ev.caja, angulo: ev.angulo, contornoSVG: ev.contornoSVG });
    }
    case "doc": {
      const [s2, d] = doc(s, ev.docId);
      return con(s2, { ...d, imagen: ev.imagen, width: ev.width, height: ev.height });
    }
    case "lectura": {
      const [s2, d] = doc(s, ev.docId);
      return con(s2, { ...d, leido: ev.leido, leidoMs: ev.ms });
    }
    case "avisos": {
      const [s2, d] = doc(s, ev.docId);
      return con(s2, { ...d, avisos: ev.avisos, sello: ev.sello, provisional: ev.provisional });
    }
    case "investigacion": {
      const [s2, d] = doc(s, ev.docId);
      const { pasos, evidencias, veredicto, valido, motivo, explicacion, ms } = ev;
      return con(s2, { ...d, leido: ev.leido, investigacion: { pasos, evidencias, veredicto, valido, motivo, explicacion, ms } });
    }
    case "expediente": {
      const [s2, d] = doc(s, ev.docId);
      const { pasos, evidencias, puntos, valido, motivo, explicacion, ms } = ev;
      return con(s2, { ...d, leido: ev.leido, expediente: { pasos, evidencias, puntos, valido, motivo, explicacion, ms } });
    }
    case "albaran": {
      const [s2, d] = doc(s, ev.docId);
      return con(s2, { ...d, sello: ev.sello, provisional: false, proveedor: ev.proveedor, numero: ev.numero, fecha: ev.fecha, totalTexto: ev.totalTexto, leyendo: false, investigando: false, reclamando: false });
    }
    case "resumen":
      return { ...s, resumen: ev };
    case "error": {
      const errores = [...s.errores, { codigo: ev.codigo, mensaje: ev.mensaje, docId: ev.docId }];
      if (ev.docId) {
        const [s2, d] = doc({ ...s, errores }, ev.docId);
        return con(s2, { ...d, error: ev.mensaje, leyendo: false, investigando: false, reclamando: false });
      }
      return { ...s, errores };
    }
    case "fin":
      return { ...s, fin: { ms: ev.ms, costeUsd: ev.costeUsd } };
  }
}

/** Money at stake across the documents finished so far (provisional until "resumen"). */
export function enJuegoParcial(s: SesionEstado): number {
  return Object.values(s.docs).filter((d) => !d.provisional).flatMap((d) => d.avisos).filter((a) => a.clase === "dinero").reduce((t, a) => t + a.centimos, 0);
}
