// Interface texts (product spec §1.9). Numbers always come from code, formatted per language.
import { formatCents } from "../numbers";
import type { Aviso, Sello } from "../checks/types";

export type Idioma = "es" | "en";

const num = (n: number, lang: Idioma, dec?: number) =>
  new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-IE", { maximumFractionDigits: dec ?? 3, minimumFractionDigits: dec ?? 0, useGrouping: "always" }).format(n);
const eur = (c: number, lang: Idioma) => formatCents(c, lang);

export const SELLO: Record<Sello, Record<Idioma, string>> = {
  CONFORME: { es: "CONFORME", en: "ALL GOOD" },
  CON_RESERVAS: { es: "CON RESERVAS", en: "CHECK BEFORE SIGNING" },
  REVISAR: { es: "REVISAR", en: "TAKE A LOOK" },
};

export function textoAviso(a: Aviso, lang: Idioma, producto?: string | null): string {
  const d = a.datos as Record<string, number & string>;
  const prod = producto ?? (lang === "es" ? "este producto" : "this product");
  const linea = (a.lineaIdx ?? 0) + 1;
  const es = lang === "es";
  switch (a.codigo) {
    case "SUBIDA":
      return es
        ? `${prod} +${num(d.pct, lang, 1)} % sobre tu precio habitual: ${eur(a.centimos, lang)} de más en este albarán`
        : `${prod} +${num(d.pct, lang, 1)}% over your usual price: ${eur(a.centimos, lang)} extra on this note`;
    case "FALTA":
      return es ? `Faltan ${num(d.faltan, lang)} ${d.unidad} de ${prod.toLowerCase()}: ${eur(a.centimos, lang)}` : `${num(d.faltan, lang)} ${d.unidad} of ${prod.toLowerCase()} missing: ${eur(a.centimos, lang)}`;
    case "ERROR_PROVEEDOR":
      return es
        ? `La línea ${linea} no cuadra: ${num(d.cantidad, lang)} × ${num(d.precio, lang, 2)} son ${eur(d.esperadoCents, lang)}, cobran ${eur(d.impresoCents, lang)}. ${eur(a.centimos, lang)} de más`
        : `Line ${linea} doesn't add up: ${num(d.cantidad, lang)} × ${num(d.precio, lang, 2)} is ${eur(d.esperadoCents, lang)}, they charge ${eur(d.impresoCents, lang)}. ${eur(a.centimos, lang)} too much`;
    case "ARITMETICA_LINEA":
      return es
        ? `La línea ${linea} no cuadra: ${num(d.cantidad, lang)} × ${num(d.precio, lang, 2)} son ${eur(d.esperadoCents, lang)} y el papel dice ${eur(d.impresoCents, lang)}`
        : `Line ${linea} doesn't add up: ${num(d.cantidad, lang)} × ${num(d.precio, lang, 2)} is ${eur(d.esperadoCents, lang)} and the paper says ${eur(d.impresoCents, lang)}`;
    case "CELDA_REPARADA":
      return es ? "Esta celda se leyó mal y se volvió a leer: ahora cuadra" : "This cell was misread and read again: it adds up now";
    case "DUPLICADO":
      return es ? `Este albarán ya lo registraste el ${d.fecha}` : `You already logged this note on ${d.fecha}`;
    case "SIN_PRECIOS":
      return es ? "Albarán sin valorar: comprobadas las unidades, no hay precios que comprobar" : "No prices on this note: units checked, nothing to price-check";
    case "SALTO_RARO":
      return es ? `Salto de precio raro (+${num(d.pct, lang, 0)} %): revisa la unidad o la lectura` : `Odd price jump (+${num(d.pct, lang, 0)}%): check the unit or the reading`;
    case "TOTALES":
      return es ? `Las sumas no cuadran (${eur(Math.abs(d.difCents), lang)})` : `The totals don't add up (${eur(Math.abs(d.difCents), lang)})`;
    case "RECUENTO_FILAS":
      return es ? `Puede faltar una línea: hay ${d.contadas} filas y se leyeron ${d.leidas}` : `A line may be missing: ${d.contadas} rows, ${d.leidas} read`;
    case "ILEGIBLE":
      return es ? `No se lee con seguridad: ${d.campo}` : `Not clearly readable: ${d.campo}`;
    case "NIF":
      return es ? "NIF ilegible o no válido" : "Tax ID unreadable or invalid";
    case "SOBRA":
      return es ? `Llegó de más: ${num(d.sobran, lang)} ${d.unidad} de ${prod.toLowerCase()}` : `Extra delivered: ${num(d.sobran, lang)} ${d.unidad} of ${prod.toLowerCase()}`;
  }
}

export const T = {
  es: {
    enJuego: "€ en juego",
    subidas: "Subidas",
    faltas: "Faltas",
    erroresProveedor: "Errores del proveedor",
    duplicados: "Duplicados",
    verEnPapel: "Ver en el papel",
    copiarReclamacion: "Copiar reclamación",
    copiada: "Reclamación copiada",
    muestraGrabada: "Muestra grabada · datos ficticios · fondo de Muse Image",
    etapas: { buscar: "Buscando albaranes en la foto", enderezar: "Enderezando", leer: "Leyendo línea a línea", comprobar: "Comprobando cada euro", investigar: "Investigando lo que no cuadra" },
    investigacion: "Lo que miró el agente",
    sinAvisos: "Todo cuadra en este albarán",
    lineas: "Líneas",
    cantidad: "Cant.",
    precio: "Precio",
    importe: "Importe",
    repetir: "Repetir",
    coste: "coste",
  },
  en: {
    enJuego: "€ at stake",
    subidas: "Price rises",
    faltas: "Shortages",
    erroresProveedor: "Supplier errors",
    duplicados: "Duplicates",
    verEnPapel: "Show on the paper",
    copiarReclamacion: "Copy claim",
    copiada: "Claim copied",
    muestraGrabada: "Recorded sample · fictional data · background by Muse Image",
    etapas: { buscar: "Finding notes in the photo", enderezar: "Straightening", leer: "Reading line by line", comprobar: "Checking every euro", investigar: "Investigating what doesn't add up" },
    investigacion: "What the agent looked at",
    sinAvisos: "Everything adds up on this note",
    lineas: "Lines",
    cantidad: "Qty",
    precio: "Price",
    importe: "Amount",
    repetir: "Replay",
    coste: "cost",
  },
} as const;
