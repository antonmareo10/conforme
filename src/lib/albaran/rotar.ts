// Turn a note upright using the rotation the reader reported (degrees clockwise), and move every box
// with it. Everything after this step (second reading, investigator crops, the screen) sees the paper
// the right way up.
import sharp from "sharp";
import type { AlbaranLeido, Caja, Campo } from "./schema";

/** Box on a 0-1000 grid after rotating the page clockwise by `deg`. */
export function rotarCaja(c: Caja | null, deg: number): Caja | null {
  if (!c || !deg) return c;
  if (deg === 90) return { x_min: 1000 - c.y_max, x_max: 1000 - c.y_min, y_min: c.x_min, y_max: c.x_max };
  if (deg === 180) return { x_min: 1000 - c.x_max, x_max: 1000 - c.x_min, y_min: 1000 - c.y_max, y_max: 1000 - c.y_min };
  if (deg === 270) return { x_min: c.y_min, x_max: c.y_max, y_min: 1000 - c.x_max, y_max: 1000 - c.x_min };
  return c;
}

export function rotarLectura(leido: AlbaranLeido, deg: number): AlbaranLeido {
  if (!deg) return leido;
  const f = (x: Campo): Campo => ({ ...x, caja: rotarCaja(x.caja, deg) });
  return {
    ...leido,
    rotacion_para_leer: 0,
    proveedor: f(leido.proveedor),
    nif_proveedor: f(leido.nif_proveedor),
    numero: f(leido.numero),
    fecha: f(leido.fecha),
    total: f(leido.total),
    lineas: leido.lineas.map((l) => ({
      ...l,
      descripcion: f(l.descripcion),
      cantidad: f(l.cantidad),
      precio_unitario: f(l.precio_unitario),
      descuento_pct: f(l.descuento_pct),
      importe: f(l.importe),
      iva_pct: f(l.iva_pct),
      caja_fila: rotarCaja(l.caja_fila, deg),
    })),
    impuestos: leido.impuestos.map((t) => ({ iva_pct: f(t.iva_pct), base: f(t.base), cuota: f(t.cuota) })),
  };
}

export async function enderezarLectura(imagen: Buffer, leido: AlbaranLeido) {
  const deg = leido.rotacion_para_leer;
  if (![90, 180, 270].includes(deg)) {
    const { width = 0, height = 0 } = await sharp(imagen).metadata();
    return { imagen, leido, width, height };
  }
  const rotada = await sharp(imagen).rotate(deg).jpeg({ quality: 90 }).toBuffer();
  const { width = 0, height = 0 } = await sharp(rotada).metadata();
  return { imagen: rotada, leido: rotarLectura(leido, deg), width, height };
}
