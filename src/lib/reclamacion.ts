// Claim message to a supplier, ready to copy. Every figure comes from the checks; the text is a template.
import { formatCents } from "./numbers";
import type { Aviso } from "./checks/types";
import type { AlbaranLeido } from "./albaran/schema";
import type { Idioma } from "./sesion/textos";

const fecha = (iso: string | null | undefined, lang: Idioma) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return lang === "es" ? ` del ${d}/${m}/${y}` : ` dated ${d}/${m}/${y}`;
};

export function reclamacion(
  avisos: Aviso[],
  meta: { numero?: string | null; fecha?: string | null; proveedor?: string | null },
  leido: AlbaranLeido | undefined,
  lang: Idioma,
): string | null {
  const conDinero = avisos.filter((a) => a.clase === "dinero" && a.centimos > 0);
  if (!conDinero.length) return null;
  const desc = (a: Aviso) => (a.lineaIdx != null ? leido?.lineas[a.lineaIdx]?.descripcion.texto ?? "" : "");
  const n = (x: number, dec = 2) => new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-IE", { minimumFractionDigits: dec, maximumFractionDigits: 3 }).format(x);
  const eur = (c: number) => formatCents(c, lang);
  const total = conDinero.reduce((s, a) => s + a.centimos, 0);
  const lineas = conDinero.map((a) => {
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
    ? `Hola${meta.proveedor ? ` (${meta.proveedor})` : ""}:\n\nRevisando el albarán nº ${meta.numero ?? "-"}${fecha(meta.fecha, lang)} hemos visto lo siguiente:\n${lineas.join("\n")}\n\nEn total, ${eur(total)}. ¿Nos lo podéis corregir en la factura o enviarnos un abono? Gracias.`
    : `Hello${meta.proveedor ? ` (${meta.proveedor})` : ""},\n\nChecking delivery note no. ${meta.numero ?? "-"}${fecha(meta.fecha, lang)} we found the following:\n${lineas.join("\n")}\n\nIn total, ${eur(total)}. Could you correct it on the invoice or send us a credit note? Thank you.`;
}
