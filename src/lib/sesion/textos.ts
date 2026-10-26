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
      if (d.motivo === "relectura_distinta")
        return es ? `Reclamación retenida en la línea ${linea}: la primera lectura dice ${d.primera} y la relectura ampliada ${d.segunda}. Míralo antes de reclamar` : `Claim held back on line ${linea}: the first reading says ${d.primera}, the zoomed re-read ${d.segunda}. Take a look before claiming`;
      if (d.motivo === "dos_lecturas" && a.lineaIdx == null)
        return es ? `Dos lecturas no coinciden en ${String(d.campo).replace("cuota", "la cuota del IVA").replace("base", "la base")}: ${d.primera || "nada"} / ${d.segunda || "nada"}` : `Two readings disagree on the ${String(d.campo).replace("cuota", "VAT amount").replace("base", "VAT base")}: ${d.primera || "nothing"} / ${d.segunda || "nothing"}`;
      if (d.motivo === "dos_lecturas")
        return es ? `Dos lecturas no coinciden en la línea ${linea}: ${d.primera || "nada"} / ${d.segunda || "nada"}` : `Two readings disagree on line ${linea}: ${d.primera || "nothing"} / ${d.segunda || "nothing"}`;
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
    muestraGrabada: "Muestra grabada · datos ficticios",
    fondoMuseImage: " · fondo de Muse Image",
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
    muestraGrabada: "Recorded sample · fictional data",
    fondoMuseImage: " · background by Muse Image",
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

const PERIODO: Record<string, Record<Idioma, string>> = {
  hoy: { es: "hoy", en: "today" },
  esta_semana: { es: "esta semana", en: "this week" },
  este_mes: { es: "este mes", en: "this month" },
  mes_pasado: { es: "el mes pasado", en: "last month" },
  todo: { es: "en total", en: "in total" },
};

const fechaCorta = (iso: string, lang: Idioma) => { const [y, m, d] = iso.split("-"); return lang === "es" ? `${d}/${m}/${y}` : `${d}/${m}/${y}`; };
const evol = (v: string | number, lang: Idioma) => String(v).split(",").filter(Boolean).map((c) => eur(Number(c), lang)).join(" → ");

/** The answer sentence. Every number in it comes from the computed answer. */
export function fraseRespuesta(r: { consulta: { intencion: string; periodo: string; proveedor: string | null; producto: string | null }; cifraCentimos: number | null; referencias: unknown[]; hechos: Record<string, string | number> }, lang: Idioma): string {
  const es = lang === "es";
  const e = r.cifraCentimos != null ? eur(r.cifraCentimos, lang) : "";
  const p = PERIODO[r.consulta.periodo]?.[lang] ?? "";
  const h = r.hechos;
  switch (r.consulta.intencion) {
    case "PAGADO_DE_MAS":
      return r.cifraCentimos ? (es ? `Has pagado de más ${e} ${p}, en ${h.conceptos} ${Number(h.conceptos) === 1 ? "concepto" : "conceptos"}.` : `You overpaid ${e} ${p}, in ${h.conceptos} ${Number(h.conceptos) === 1 ? "item" : "items"}.`) : es ? `No hay nada pagado de más ${p}.` : `Nothing overpaid ${p}.`;
    case "SUBIDAS":
      return Number(h.subidas) ? (es ? `${h.subidas} ${Number(h.subidas) === 1 ? "subida" : "subidas"}: ${h.lista}. En total, ${e}.` : `${h.subidas} price ${Number(h.subidas) === 1 ? "rise" : "rises"}: ${h.lista}. ${e} in total.`) : es ? "No ha subido nada de precio." : "Nothing went up in price.";
    case "GASTO_PROVEEDOR":
      if (h.mayor) {
        const resto = String(h.ranking ?? "").split("|").filter(Boolean).map((x) => { const k = x.lastIndexOf(":"); return `${x.slice(0, k)} ${eur(Number(x.slice(k + 1)), lang)}`; });
        return es
          ? `${h.proveedor} es quien más te ha cobrado ${p}: ${e} en ${h.albaranesProveedor} ${Number(h.albaranesProveedor) === 1 ? "albarán" : "albaranes"}.${resto.length ? ` Después: ${resto.join(", ")}.` : ""}`
          : `${h.proveedor} charged you the most ${p}: ${e} on ${h.albaranesProveedor} ${Number(h.albaranesProveedor) === 1 ? "note" : "notes"}.${resto.length ? ` Then: ${resto.join(", ")}.` : ""}`;
      }
      return es ? `${h.proveedor || "Ese proveedor"} te ha cobrado ${e} ${p}, en ${h.albaranesProveedor} ${Number(h.albaranesProveedor) === 1 ? "albarán" : "albaranes"}.` : `${h.proveedor || "That supplier"} charged you ${e} ${p}, on ${h.albaranesProveedor} ${Number(h.albaranesProveedor) === 1 ? "note" : "notes"}.`;
    case "GASTO_PRODUCTO":
      return es ? `Llevas ${e} en ${String(h.producto).toLowerCase()} ${p} (${h.lineas} ${Number(h.lineas) === 1 ? "línea" : "líneas"}).` : `You've spent ${e} on ${String(h.producto).toLowerCase()} ${p} (${h.lineas} ${Number(h.lineas) === 1 ? "line" : "lines"}).`;
    case "ULTIMO_PRECIO":
      return r.cifraCentimos != null
        ? (es ? `La última vez (${fechaCorta(String(h.fecha), lang)}) te cobraron ${String(h.producto).toLowerCase()} a ${e}. Evolución: ${evol(h.evolucion, lang)}.` : `Last time (${fechaCorta(String(h.fecha), lang)}) ${String(h.producto).toLowerCase()} cost ${e}. History: ${evol(h.evolucion, lang)}.`)
        : es ? "No encuentro ese producto en tus albaranes." : "I can't find that product in your notes.";
    case "AVISOS":
      return es ? `${h.conProblemas} ${Number(h.conProblemas) === 1 ? "albarán tiene" : "albaranes tienen"} algo que mirar.` : `${h.conProblemas} ${Number(h.conProblemas) === 1 ? "note has" : "notes have"} something to look at.`;
    case "IVA":
      return es ? `Llevas ${e} de IVA ${p}.` : `${e} of VAT ${p}.`;
    default:
      return es ? "Todavía no sé responder eso. Prueba con: «¿cuánto he pagado de más este mes?»" : "I can't answer that yet. Try: \"how much have I overpaid this month?\"";
  }
}
