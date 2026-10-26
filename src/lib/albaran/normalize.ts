import { decimalMark, parsePrinted, withDecimalMark } from "../numbers";
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

const clean = (t: string | null) => (t && t.trim() ? t.trim() : null);

export function normalize(docId: string, leido: AlbaranLeido): Albaran {
  // One decimal mark per document, decided from its unambiguous numbers.
  const numericTexts = [
    ...leido.lineas.flatMap((l) => [l.cantidad.texto, l.precio_unitario.texto, l.importe.texto, l.descuento_pct.texto]),
    ...leido.impuestos.flatMap((t) => [t.base.texto, t.cuota.texto]),
    leido.total.texto,
  ];
  const mark = decimalMark(numericTexts);
  const noNumericos: string[] = [];
  const num = (texto: string | null, campo: string) => {
    const p = withDecimalMark(parsePrinted(texto), mark);
    if (texto && texto.trim() && !p) noNumericos.push(campo);
    return p;
  };
  // VAT rates are small numbers: "10,00" → 10, "21,0" → 21, "4%" → 4.
  const pct = (texto: string | null) => {
    const p = parsePrinted(texto);
    return p ? (p.candidates.find((c) => c >= 0 && c <= 100) ?? null) : null;
  };

  const lineas: Linea[] = leido.lineas.map((l, idx) => ({
    idx,
    descripcion: clean(l.descripcion.texto),
    unidad: clean(l.unidad),
    cantidad: num(l.cantidad.texto, `linea ${idx + 1} cantidad`),
    precio: num(l.precio_unitario.texto, `linea ${idx + 1} precio`),
    descuentoPct: num(l.descuento_pct.texto, `linea ${idx + 1} descuento`),
    importe: num(l.importe.texto, `linea ${idx + 1} importe`),
    ivaPct: pct(l.iva_pct.texto),
    cajas: {
      fila: l.caja_fila,
      cantidad: l.cantidad.caja,
      precio: l.precio_unitario.caja,
      importe: l.importe.caja,
      descripcion: l.descripcion.caja,
    },
  }));
  const impuestos: Impuesto[] = leido.impuestos.map((t, i) => ({
    ivaPct: pct(t.iva_pct.texto),
    base: num(t.base.texto, `impuestos ${i + 1} base`),
    cuota: num(t.cuota.texto, `impuestos ${i + 1} cuota`),
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
    total: num(leido.total.texto, "total"),
    filasContadas: Number.isInteger(leido.filas_de_producto_contadas) ? leido.filas_de_producto_contadas : null,
    ilegible: leido.ilegible,
    noNumericos,
    cajas: {
      proveedor: leido.proveedor.caja,
      nif: leido.nif_proveedor.caja,
      numero: leido.numero.caja,
      fecha: leido.fecha.caja,
      total: leido.total.caja,
    },
  };
}
