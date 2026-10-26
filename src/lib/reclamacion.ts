// What the restaurant sends or writes, ready to use. Every figure comes from the checks; the texts are
// templates, so nothing the model writes ends up in front of a supplier.
//  - reclamacion(): the message to the supplier (the proof image goes with it).
//  - reserva(): the short line to write on the delivery note before signing it, while the driver waits.
//  - calculo(): one line per claim for the proof image, with the code's arithmetic.
import { formatCents } from "./numbers";
import type { Aviso } from "./checks/types";
import type { AlbaranLeido } from "./albaran/schema";
import type { Idioma } from "./sesion/textos";

const fecha = (iso: string | null | undefined, lang: Idioma) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return lang === "es" ? ` del ${d}/${m}/${y}` : ` dated ${d}/${m}/${y}`;
};
const num = (lang: Idioma) => (x: number, dec = 2) => new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-IE", { minimumFractionDigits: dec, maximumFractionDigits: 3 }).format(x);

/** Money warnings that make a claim: positive amount, in the order the checks found them. */
export const conDinero = (avisos: Aviso[]) => avisos.filter((a) => a.clase === "dinero" && a.centimos > 0);

export function reclamacion(
  avisos: Aviso[],
  meta: { numero?: string | null; fecha?: string | null; proveedor?: string | null },
  leido: AlbaranLeido | undefined,
  lang: Idioma,
): string | null {
  const items = conDinero(avisos);
  if (!items.length) return null;
  const desc = (a: Aviso) => (a.lineaIdx != null ? leido?.lineas[a.lineaIdx]?.descripcion.texto ?? "" : "");
  const n = num(lang);
  const eur = (c: number) => formatCents(c, lang);
  const total = items.reduce((s, a) => s + a.centimos, 0);
  const lineas = items.map((a) => {
    const d = a.datos as Record<string, number & string>;
    const linea = (a.lineaIdx ?? 0) + 1;
    if (lang === "es") {
      switch (a.codigo) {
        case "ERROR_PROVEEDOR": return `- Línea ${linea} (${desc(a)}): ${n(d.cantidad, 0)} × ${n(d.precio)} € son ${eur(d.esperadoCents)}, pero se cobran ${eur(d.impresoCents)}. Diferencia: ${eur(a.centimos)}.`;
        case "FALTA": return `- ${desc(a)}: pedimos ${n(d.pedido, 0)} ${d.unidad} y llegaron ${n(d.recibido, 0)} ${d.unidad}. Faltan ${n(d.faltan, 0)} ${d.unidad}: ${eur(a.centimos)}.`;
        case "SUBIDA": return `- ${desc(a)}: ${n(d.precio)} €/ud frente a nuestro precio habitual de ${n(d.referencia)} € (+${n(d.pct, 1)} %). En este albarán son ${eur(a.centimos)} de más. ¿Podéis confirmarnos el precio?`;
        case "DUPLICADO": return `- Este albarán parece duplicado de uno anterior (${d.fecha}). Importe: ${eur(a.centimos)}.`;
        default: return `- ${eur(a.centimos)}.`;
      }
    }
    switch (a.codigo) {
      case "ERROR_PROVEEDOR": return `- Line ${linea} (${desc(a)}): ${n(d.cantidad, 0)} × €${n(d.precio)} is ${eur(d.esperadoCents)}, but ${eur(d.impresoCents)} is charged. Difference: ${eur(a.centimos)}.`;
      case "FALTA": return `- ${desc(a)}: we ordered ${n(d.pedido, 0)} ${d.unidad} and received ${n(d.recibido, 0)} ${d.unidad}. ${n(d.faltan, 0)} ${d.unidad} missing: ${eur(a.centimos)}.`;
      case "SUBIDA": return `- ${desc(a)}: €${n(d.precio)}/unit against our usual €${n(d.referencia)} (+${n(d.pct, 1)}%). ${eur(a.centimos)} extra on this note. Could you confirm the price?`;
      case "DUPLICADO": return `- This note looks like a duplicate of an earlier one (${d.fecha}). Amount: ${eur(a.centimos)}.`;
      default: return `- ${eur(a.centimos)}.`;
    }
  });
  return lang === "es"
    ? `Hola${meta.proveedor ? ` (${meta.proveedor})` : ""}:\n\nRevisando el albarán nº ${meta.numero ?? "-"}${fecha(meta.fecha, lang)} hemos visto lo siguiente:\n${lineas.join("\n")}\n\nEn total, ${eur(total)}. Os adjunto la foto de vuestro albarán con cada línea marcada. ¿Nos lo podéis corregir en la factura o enviarnos un abono? Gracias.`
    : `Hello${meta.proveedor ? ` (${meta.proveedor})` : ""},\n\nChecking delivery note no. ${meta.numero ?? "-"}${fecha(meta.fecha, lang)} we found the following:\n${lineas.join("\n")}\n\nIn total, ${eur(total)}. I attach a photo of your note with each line marked. Could you correct it on the invoice or send us a credit note? Thank you.`;
}

/** The short line to write by hand next to the signature, so the delivery is accepted with reservations. */
export function reserva(avisos: Aviso[], leido: AlbaranLeido | undefined, lang: Idioma): string | null {
  const items = conDinero(avisos);
  if (!items.length) return null;
  const n = num(lang);
  const prod = (a: Aviso) => (a.lineaIdx != null ? leido?.lineas[a.lineaIdx]?.descripcion.texto ?? "" : "").toLowerCase();
  const es = lang === "es";
  const partes = items.map((a) => {
    const d = a.datos as Record<string, number & string>;
    const linea = (a.lineaIdx ?? 0) + 1;
    switch (a.codigo) {
      case "FALTA": return es ? `faltan ${n(d.faltan, 0)} ${d.unidad} de ${prod(a)} (pedidos ${n(d.pedido, 0)})` : `${n(d.faltan, 0)} ${d.unidad} of ${prod(a)} missing (${n(d.pedido, 0)} ordered)`;
      case "ERROR_PROVEEDOR": return es ? `línea ${linea} mal calculada (${n(d.cantidad, 0)} × ${n(d.precio)} = ${formatCents(d.esperadoCents, lang)}, no ${formatCents(d.impresoCents, lang)})` : `line ${linea} miscalculated (${n(d.cantidad, 0)} × ${n(d.precio)} = ${formatCents(d.esperadoCents, lang)}, not ${formatCents(d.impresoCents, lang)})`;
      case "SUBIDA": return es ? `precio de ${prod(a)} a ${n(d.precio)} € pendiente de confirmar` : `price of ${prod(a)} at €${n(d.precio)} to be confirmed`;
      case "DUPLICADO": return es ? `posible duplicado del ${d.fecha}` : `possible duplicate of ${d.fecha}`;
      default: return "";
    }
  }).filter(Boolean);
  return es ? `Recibido con reservas: ${partes.join("; ")}.` : `Received with reservations: ${partes.join("; ")}.`;
}

/** One line of arithmetic per claim, for the proof image. Code's numbers only. */
export function calculo(a: Aviso, lang: Idioma): string {
  const d = a.datos as Record<string, number & string>;
  const n = num(lang);
  const eur = (c: number) => formatCents(c, lang);
  const es = lang === "es";
  switch (a.codigo) {
    case "ERROR_PROVEEDOR": return es ? `${n(d.cantidad, 0)} × ${n(d.precio)} € = ${eur(d.esperadoCents)} · cobrado ${eur(d.impresoCents)} · diferencia ${eur(a.centimos)}` : `${n(d.cantidad, 0)} × €${n(d.precio)} = ${eur(d.esperadoCents)} · charged ${eur(d.impresoCents)} · difference ${eur(a.centimos)}`;
    case "FALTA": return es ? `Pedido ${n(d.pedido, 0)} ${d.unidad} · entregado ${n(d.recibido, 0)} ${d.unidad} · faltan ${n(d.faltan, 0)} ${d.unidad} = ${eur(a.centimos)}` : `Ordered ${n(d.pedido, 0)} ${d.unidad} · delivered ${n(d.recibido, 0)} ${d.unidad} · ${n(d.faltan, 0)} ${d.unidad} missing = ${eur(a.centimos)}`;
    case "SUBIDA": return es ? `${n(d.precio)} €/ud frente a ${n(d.referencia)} € habitual (+${n(d.pct, 1)} %) × ${n(d.cantidad)} = ${eur(a.centimos)} de más` : `€${n(d.precio)}/unit against usual €${n(d.referencia)} (+${n(d.pct, 1)}%) × ${n(d.cantidad)} = ${eur(a.centimos)} extra`;
    case "DUPLICADO": return es ? `Ya registrado el ${d.fecha} · ${eur(a.centimos)}` : `Already logged on ${d.fecha} · ${eur(a.centimos)}`;
    default: return eur(a.centimos);
  }
}
