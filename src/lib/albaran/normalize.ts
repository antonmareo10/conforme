import { parsePrinted } from "../numbers";
import type { Albaran, Impuesto, Linea } from "../checks/types";
import type { AlbaranLeido } from "./schema";

/** Parse a printed date (dd/mm/yy, dd-mm-yyyy, dd.mm.yyyy, yyyy-mm-dd) to ISO, or null. */
export function parseFecha(texto: string | null): string | null {
  if (!texto) return null;
  const s = texto.trim();
  let d: number, m: number, y: number;
  let match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function pct(texto: string | null): number | null {
  const p = parsePrinted(texto);
  return p ? p.candidates[0] : null;
}

const clean = (t: string | null) => (t && t.trim() ? t.trim() : null);

export function normalize(docId: string, leido: AlbaranLeido): Albaran {
  const lineas: Linea[] = leido.lineas.map((l, idx) => ({
    idx,
    descripcion: clean(l.descripcion.texto),
    unidad: clean(l.unidad),
    cantidad: parsePrinted(l.cantidad.texto),
    precio: parsePrinted(l.precio_unitario.texto),
    descuentoPct: parsePrinted(l.descuento_pct.texto),
    importe: parsePrinted(l.importe.texto),
    ivaPct: pct(l.iva_pct.texto),
    cajas: {
      fila: l.caja_fila,
      cantidad: l.cantidad.caja,
      precio: l.precio_unitario.caja,
      importe: l.importe.caja,
      descripcion: l.descripcion.caja,
    },
  }));
  const impuestos: Impuesto[] = leido.impuestos.map((t) => ({
    ivaPct: pct(t.iva_pct.texto),
    base: parsePrinted(t.base.texto),
    cuota: parsePrinted(t.cuota.texto),
    cajas: { base: t.base.caja, cuota: t.cuota.caja },
  }));
  return {
    docId,
    proveedor: clean(leido.proveedor.texto),
    nif: clean(leido.nif_proveedor.texto),
    numero: clean(leido.numero.texto),
    fecha: parseFecha(leido.fecha.texto),
    lineas,
    impuestos,
    total: parsePrinted(leido.total.texto),
    filasContadas: Number.isInteger(leido.filas_de_producto_contadas) ? leido.filas_de_producto_contadas : null,
    ilegible: leido.ilegible,
    cajas: {
      proveedor: leido.proveedor.caja,
      nif: leido.nif_proveedor.caja,
      numero: leido.numero.caja,
      fecha: leido.fecha.caja,
      total: leido.total.caja,
    },
  };
}
