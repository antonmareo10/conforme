// Questions about the session's notes. The model only turns the question into an intent (closed set,
// suppliers and products restricted to what the session holds); every figure, and which lines light
// up, is computed here.
import type { AlbaranLeido } from "./albaran/schema";
import { normalize } from "./albaran/normalize";
import { aritmeticaLinea, claveProducto, importeLinea, inferirIva } from "./checks/engine";
import type { Aviso } from "./checks/types";
import { toCents } from "./numbers";

export const INTENCIONES = ["PAGADO_DE_MAS", "SUBIDAS", "GASTO_PROVEEDOR", "GASTO_PRODUCTO", "ULTIMO_PRECIO", "AVISOS", "IVA", "DESCONOCIDA"] as const;
export type Intencion = (typeof INTENCIONES)[number];
export const PERIODOS = ["hoy", "esta_semana", "este_mes", "mes_pasado", "todo"] as const;
export type Periodo = (typeof PERIODOS)[number];

export interface Consulta {
  intencion: Intencion;
  proveedor: string | null;
  producto: string | null;
  periodo: Periodo;
}

export interface DocSesion {
  docId: string;
  leido: AlbaranLeido;
  avisos: Aviso[];
}

export interface Referencia {
  docId: string;
  lineaIdx: number | null; // null = the note's total
  centimos: number;
}

export interface Respuesta {
  consulta: Consulta;
  cifraCentimos: number | null;
  referencias: Referencia[];
  /** Short structured facts for the sentence templates (all computed here). */
  hechos: Record<string, string | number>;
}

const DIA = 86_400_000;

/** Period bounds relative to the most recent note in the session (the demo month lives in the past). */
export function rango(periodo: Periodo, docs: { fecha: string | null }[]): { desde: string; hasta: string } | null {
  const fechas = docs.map((d) => d.fecha).filter((f): f is string => !!f).sort();
  if (!fechas.length || periodo === "todo") return null;
  const ref = new Date(fechas[fechas.length - 1] + "T00:00:00Z");
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (periodo === "hoy") return { desde: iso(ref), hasta: iso(ref) };
  if (periodo === "esta_semana") return { desde: iso(new Date(ref.getTime() - ((ref.getUTCDay() + 6) % 7) * DIA)), hasta: iso(ref) };
  if (periodo === "este_mes") return { desde: iso(new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1))), hasta: iso(ref) };
  const ini = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 1, 1));
  const fin = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 0));
  return { desde: iso(ini), hasta: iso(fin) };
}

export function responder(c: Consulta, docs: DocSesion[]): Respuesta {
  const albaranes = docs.map((d) => ({ d, a: inferirIva(normalize(d.docId, d.leido)) }));
  const r = rango(c.periodo, albaranes.map((x) => x.a));
  const delProveedor = (p: string | null) => (x: (typeof albaranes)[number]) => !p || claveProducto(x.a.proveedor) === claveProducto(p);
  // Every intent respects the period and, when the question names one, the supplier.
  const enPeriodo = albaranes.filter(({ a }) => !r || (a.fecha != null && a.fecha >= r.desde && a.fecha <= r.hasta)).filter(delProveedor(c.proveedor));
  const base: Respuesta = { consulta: c, cifraCentimos: null, referencias: [], hechos: { albaranes: enPeriodo.length } };

  switch (c.intencion) {
    case "PAGADO_DE_MAS": {
      const refs: Referencia[] = [];
      for (const { d } of enPeriodo)
        for (const a of d.avisos)
          if ((a.codigo === "SUBIDA" || a.codigo === "ERROR_PROVEEDOR" || a.codigo === "DUPLICADO") && a.centimos > 0)
            refs.push({ docId: d.docId, lineaIdx: a.lineaIdx ?? null, centimos: a.centimos });
      return { ...base, cifraCentimos: refs.reduce((s, x) => s + x.centimos, 0), referencias: refs, hechos: { ...base.hechos, conceptos: refs.length } };
    }
    case "SUBIDAS": {
      const refs: Referencia[] = [];
      const productos: string[] = [];
      for (const { d } of enPeriodo)
        for (const a of d.avisos)
          if (a.codigo === "SUBIDA" && a.lineaIdx != null) {
            refs.push({ docId: d.docId, lineaIdx: a.lineaIdx, centimos: a.centimos });
            productos.push(`${d.leido.lineas[a.lineaIdx]?.descripcion.texto ?? ""} +${a.datos.pct} %`);
          }
      refs.sort((x, y) => y.centimos - x.centimos);
      return { ...base, cifraCentimos: refs.reduce((s, x) => s + x.centimos, 0), referencias: refs, hechos: { ...base.hechos, subidas: refs.length, lista: productos.join(", ") } };
    }
    case "GASTO_PROVEEDOR": {
      if (!c.proveedor) {
        // No supplier named ("who charged me the most?"): rank them; the answer is the top one.
        const porProv = new Map<string, { docs: typeof enPeriodo; cents: number }>();
        for (const x of enPeriodo) {
          const nombre = x.a.proveedor ?? "?";
          const g = porProv.get(nombre) ?? { docs: [], cents: 0 };
          g.docs.push(x);
          g.cents += x.a.total ? toCents(x.a.total.candidates[0]) : 0;
          porProv.set(nombre, g);
        }
        const ranking = [...porProv.entries()].sort((p1, p2) => p2[1].cents - p1[1].cents);
        const [nombre, top] = ranking[0] ?? ["", { docs: [], cents: 0 }];
        const refs = top.docs.map(({ a }) => ({ docId: a.docId, lineaIdx: null, centimos: a.total ? toCents(a.total.candidates[0]) : 0 }));
        return { ...base, cifraCentimos: top.cents, referencias: refs, hechos: { ...base.hechos, proveedor: nombre, albaranesProveedor: top.docs.length, mayor: 1, ranking: ranking.slice(1, 4).map(([n2, g]) => `${n2}:${g.cents}`).join("|") } };
      }
      const sel = enPeriodo.filter(delProveedor(c.proveedor));
      const refs = sel.map(({ a }) => ({ docId: a.docId, lineaIdx: null, centimos: a.total ? toCents(a.total.candidates[0]) : 0 }));
      return { ...base, cifraCentimos: refs.reduce((s, x) => s + x.centimos, 0), referencias: refs, hechos: { ...base.hechos, proveedor: c.proveedor ?? "", albaranesProveedor: sel.length } };
    }
    case "GASTO_PRODUCTO":
    case "ULTIMO_PRECIO": {
      const refs: (Referencia & { fecha: string; precio: number | null })[] = [];
      for (const { a } of enPeriodo)
        for (const l of a.lineas)
          if (c.producto && claveProducto(l.descripcion).includes(claveProducto(c.producto))) {
            const ar = aritmeticaLinea(l);
            refs.push({ docId: a.docId, lineaIdx: l.idx, centimos: importeLinea(l) ?? 0, fecha: a.fecha ?? "", precio: ar?.ok ? ar.precio : l.precio?.candidates[0] ?? null });
          }
      refs.sort((x, y) => x.fecha.localeCompare(y.fecha));
      if (c.intencion === "GASTO_PRODUCTO")
        return { ...base, cifraCentimos: refs.reduce((s, x) => s + x.centimos, 0), referencias: refs.map(({ docId, lineaIdx, centimos }) => ({ docId, lineaIdx, centimos })), hechos: { ...base.hechos, producto: c.producto ?? "", lineas: refs.length } };
      const ultima = refs[refs.length - 1];
      if (!ultima) return { ...base, hechos: { ...base.hechos, producto: c.producto ?? "" } };
      return {
        ...base,
        cifraCentimos: ultima.precio != null ? toCents(ultima.precio) : null,
        referencias: [{ docId: ultima.docId, lineaIdx: ultima.lineaIdx, centimos: ultima.centimos }],
        hechos: { ...base.hechos, producto: c.producto ?? "", fecha: ultima.fecha, evolucion: refs.map((x) => x.precio).filter((p): p is number => p != null).map((p) => toCents(p)).join(",") },
      };
    }
    case "AVISOS": {
      const refs: Referencia[] = [];
      for (const { d } of enPeriodo)
        for (const a of d.avisos) if (a.clase !== "info") refs.push({ docId: d.docId, lineaIdx: a.lineaIdx ?? null, centimos: a.centimos });
      return { ...base, cifraCentimos: null, referencias: refs, hechos: { ...base.hechos, conProblemas: new Set(refs.map((x) => x.docId)).size } };
    }
    case "IVA": {
      let cuota = 0;
      const refs: Referencia[] = [];
      for (const { a } of enPeriodo)
        for (const t of a.impuestos) if (t.cuota) { cuota += toCents(t.cuota.candidates[0]); refs.push({ docId: a.docId, lineaIdx: null, centimos: toCents(t.cuota.candidates[0]) }); }
      return { ...base, cifraCentimos: cuota, referencias: refs };
    }
    default:
      return base;
  }
}
