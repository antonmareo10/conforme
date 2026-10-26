// Printed numbers on delivery notes, as the model copies them ("1.234,56", "27,7500", "8.50", "1,000").
// The model never computes; it copies text. This module turns that text into values the code can check.

export interface ParsedNumber {
  /** The printed text, trimmed. */
  text: string;
  /** Every reading that is plausible for this text, most likely first. */
  candidates: number[];
  /** Number of decimals printed in the most likely reading. */
  decimals: number;
  /** True when the text can honestly mean two different numbers (e.g. "1.000" = 1 or 1000). */
  ambiguous: boolean;
}

const CLEAN = /[\s€%]|EUR|eur/g;

/**
 * Parse a printed number. Spanish notes use a decimal comma and a dot for thousands;
 * some print a decimal dot. When only one separator appears and it is followed by
 * exactly three digits, both readings are kept so the arithmetic checks can decide.
 */
export function parsePrinted(raw: string | null | undefined): ParsedNumber | null {
  if (raw == null) return null;
  // Drop a trailing unit the model sometimes copies with the number ("3U", "12,00 kg", "4 uds.").
  let s = raw.replace(CLEAN, "").trim().replace(/(?<=\d)\s*[A-Za-zÀ-ÿ]{1,6}\.?$/, "").trim();
  if (!s) return null;
  let sign = 1;
  if (/^-|-$/.test(s) || /^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.replace(/^-|-$/g, "").replace(/^\((.*)\)$/, "$1");
  }
  if (!/^[\d.,]+$/.test(s)) {
    // A label copied with the number ("TOTAL 163,63", "Base: 86,40"): keep it only if there is exactly one number.
    const tokens = s.match(/\d[\d.,]*\d|\d/g) ?? [];
    if (tokens.length !== 1) return null;
    s = tokens[0];
  }
  if (!/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const text = raw.trim();

  const make = (intPart: string, decPart: string): number =>
    sign * Number(`${intPart.replace(/[.,]/g, "") || "0"}.${decPart || "0"}`);

  // Both separators: the last one is the decimal separator.
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? "," : ".";
    const i = s.lastIndexOf(dec);
    const decPart = s.slice(i + 1);
    return { text, candidates: [make(s.slice(0, i), decPart)], decimals: decPart.length, ambiguous: false };
  }

  const sep = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;
  if (!sep) return { text, candidates: [sign * Number(s)], decimals: 0, ambiguous: false };

  const parts = s.split(sep);
  if (parts.length > 2) {
    // "1.234.567" or "1,234,567": the separator groups thousands.
    return { text, candidates: [sign * Number(parts.join(""))], decimals: 0, ambiguous: false };
  }
  const [intPart, decPart] = parts;
  const asDecimal = make(intPart, decPart);
  if (decPart.length !== 3) return { text, candidates: [asDecimal], decimals: decPart.length, ambiguous: false };

  // Exactly three digits after a single separator.
  const asThousands = sign * Number(intPart + decPart);
  if (intPart === "0" || intPart === "") {
    return { text, candidates: [asDecimal], decimals: 3, ambiguous: false };
  }
  // A comma is the Spanish decimal mark ("1,000" kg = one kilo): prefer decimal, keep thousands.
  // A dot is the Spanish thousands mark ("1.000" = one thousand): prefer thousands, keep decimal.
  return sep === ","
    ? { text, candidates: [asDecimal, asThousands], decimals: 3, ambiguous: true }
    : { text, candidates: [asThousands, asDecimal], decimals: 0, ambiguous: true };
}

/**
 * Which decimal mark a document uses, from its unambiguous numbers: one separator followed by
 * 1, 2 or 4+ digits ("6.12", "86,40", "27,7500"). Returns null when there is no evidence.
 */
export function decimalMark(texts: (string | null | undefined)[]): "," | "." | null {
  let comma = 0, dot = 0;
  for (const t of texts) {
    const s = (t ?? "").replace(CLEAN, "").replace(/[A-Za-z]+\.?$/, "").trim();
    if (/^-?\d+,\d{1,2}$|^-?\d+,\d{4,}$|^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) comma++;
    else if (/^-?\d+\.\d{1,2}$|^-?\d+\.\d{4,}$|^-?\d{1,3}(,\d{3})+\.\d+$/.test(s)) dot++;
  }
  if (comma === dot) return null;
  return comma > dot ? "," : ".";
}

/** Put first the reading of an ambiguous number that matches the document's decimal mark. */
export function withDecimalMark(p: ParsedNumber | null, mark: "," | "." | null): ParsedNumber | null {
  if (!p || !p.ambiguous || !mark) return p;
  const sep = p.text.includes(",") ? "," : ".";
  const [a, b] = p.candidates;
  // candidates[0] is "decimal" when sep is ",", "thousands" when sep is "."
  const decimalFirst = sep === mark;
  const decimal = sep === "," ? a : b;
  const thousands = sep === "," ? b : a;
  return decimalFirst
    ? { ...p, candidates: [decimal, thousands], decimals: 3 }
    : { ...p, candidates: [thousands, decimal], decimals: 0 };
}

/** Money in integer cents (rounded half away from zero), from a printed amount. */
export function toCents(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-9);
}

/** Money tolerance used across checks: max(0.02 €, 0.5 %). */
export function moneyTolerance(cents: number): number {
  return Math.max(2, Math.abs(cents) * 0.005);
}

export function formatCents(cents: number, locale: "es" | "en"): string {
  // "always": Spanish locale data skips the dot in 4-digit numbers; we want "1.234,50 €".
  return new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-IE", { style: "currency", currency: "EUR", useGrouping: "always" }).format(cents / 100);
}
