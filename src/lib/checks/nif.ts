// Spanish tax ID check digits: DNI/NIF, NIE and CIF. Informational only: a bad check digit
// usually means a misread, not fraud.

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const CIF_CONTROL_LETTERS = "JABCDEFGHI";

export function normalizeNif(raw: string): string {
  return raw.toUpperCase().replace(/^ES/, "").replace(/[\s.\-/]/g, "");
}

export function isValidNif(raw: string | null): boolean {
  if (!raw) return false;
  const s = normalizeNif(raw);

  if (/^\d{8}[A-Z]$/.test(s)) return DNI_LETTERS[Number(s.slice(0, 8)) % 23] === s[8];

  if (/^[XYZ]\d{7}[A-Z]$/.test(s)) {
    const n = Number(String("XYZ".indexOf(s[0])) + s.slice(1, 8));
    return DNI_LETTERS[n % 23] === s[8];
  }

  const cif = s.match(/^([ABCDEFGHJKLMNPQRSUVW])(\d{7})([0-9A-J])$/);
  if (cif) {
    const [, letter, digits, control] = cif;
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const d = Number(digits[i]);
      if (i % 2 === 0) {
        const x = d * 2;
        sum += Math.floor(x / 10) + (x % 10);
      } else sum += d;
    }
    const digit = (10 - (sum % 10)) % 10;
    const asLetter = CIF_CONTROL_LETTERS[digit];
    if ("PQRSNW".includes(letter)) return control === asLetter;
    if ("ABEH".includes(letter)) return control === String(digit);
    return control === String(digit) || control === asLetter;
  }
  return false;
}
