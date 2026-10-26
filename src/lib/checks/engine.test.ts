import { describe, expect, it } from "vitest";
import { parsePrinted, formatCents, decimalMark, withDecimalMark } from "../numbers";
import { isValidNif } from "./nif";
import { aritmeticaLinea, comprobar, enJuego, inferirIva, sello, totales } from "./engine";
import type { Albaran, Contexto, Linea } from "./types";
import { parseFecha } from "../albaran/normalize";

const L = (idx: number, desc: string, cant: string, unidad: string | null, precio: string | null, importe: string | null, iva = 10, dto: string | null = null): Linea => ({
  idx,
  descripcion: desc,
  unidad,
  cantidad: parsePrinted(cant),
  precio: parsePrinted(precio),
  descuentoPct: parsePrinted(dto),
  importe: parsePrinted(importe),
  ivaPct: iva,
  cajas: { fila: null, cantidad: null, precio: null, importe: null, descripcion: null },
});

const A = (docId: string, proveedor: string, fecha: string, lineas: Linea[], impuestos: Albaran["impuestos"], total: string | null, extra: Partial<Albaran> = {}): Albaran => ({
  docId,
  proveedor,
  nif: null,
  numero: null,
  fecha,
  lineas,
  impuestos,
  total: parsePrinted(total),
  filasContadas: lineas.length,
  ilegible: [],
  noNumericos: [],
  discrepancias: [],
  cajas: { proveedor: null, nif: null, numero: null, fecha: null, total: null },
  ...extra,
});

const T = (iva: number, base: string, cuota: string) => ({ ivaPct: iva, base: parsePrinted(base), cuota: parsePrinted(cuota), cajas: { base: null, cuota: null } });

describe("parsePrinted", () => {
  it("reads Spanish decimals and thousands", () => {
    expect(parsePrinted("1.234,56")?.candidates).toEqual([1234.56]);
    expect(parsePrinted("27,7500")?.candidates).toEqual([27.75]);
    expect(parsePrinted("8.50")?.candidates).toEqual([8.5]);
    expect(parsePrinted("30,53 €")?.candidates).toEqual([30.53]);
    expect(parsePrinted("-5,40")?.candidates).toEqual([-5.4]);
  });
  it("keeps both readings when three digits follow a single separator", () => {
    expect(parsePrinted("1,000")).toMatchObject({ candidates: [1, 1000], ambiguous: true });
    expect(parsePrinted("1.000")).toMatchObject({ candidates: [1000, 1], ambiguous: true });
    expect(parsePrinted("0,250")).toMatchObject({ candidates: [0.25], ambiguous: false });
  });
  it("keeps the number when a label was copied with it, but not when there are several", () => {
    expect(parsePrinted("TOTAL 163,63 €")?.candidates).toEqual([163.63]);
    expect(parsePrinted("12,000 kg x 1,85")).toBeNull();
  });
  it("rejects text that is not a number", () => {
    expect(parsePrinted("abc")).toBeNull();
    expect(parsePrinted("")).toBeNull();
    expect(parsePrinted(null)).toBeNull();
  });
  it("formats money per language", () => {
    expect(formatCents(123450, "es").replace(/ /g, " ")).toBe("1.234,50 €");
    expect(formatCents(744, "en")).toBe("€7.44");
  });
});

describe("parseFecha", () => {
  it("parses common printed formats", () => {
    expect(parseFecha("10-06-2026")).toBe("2026-06-10");
    expect(parseFecha("11/06/26")).toBe("2026-06-11");
    expect(parseFecha("2026-06-11")).toBe("2026-06-11");
    expect(parseFecha("Fecha: 3.7.2026")).toBe("2026-07-03");
    expect(parseFecha("31/02/2026")).toBeNull();
  });
});

describe("NIF", () => {
  it("validates DNI, NIE and CIF check characters", () => {
    expect(isValidNif("12345678Z")).toBe(true);
    expect(isValidNif("12345678A")).toBe(false);
    expect(isValidNif("X1234567L")).toBe(true);
    expect(isValidNif("B12345674")).toBe(true);
    expect(isValidNif("B-12345674")).toBe(true);
    expect(isValidNif("B12345675")).toBe(false);
    expect(isValidNif("P1234567D")).toBe(true);
  });
});

describe("line arithmetic", () => {
  it("accepts a line that adds up, with tolerance", () => {
    expect(aritmeticaLinea(L(0, "merluza", "6,20", "kg", "11,90", "73,78"))?.ok).toBe(true);
    expect(aritmeticaLinea(L(0, "x", "3", "ud", "1,10", "3,31"))?.ok).toBe(true); // 1 cent
  });
  it("uses the reading of an ambiguous quantity that makes the line add up", () => {
    const r = aritmeticaLinea(L(0, "choripincho", "1,000", "ud", "27,7500", "27,75"));
    expect(r).toMatchObject({ ok: true, cantidad: 1 });
  });
  it("applies discounts", () => {
    expect(aritmeticaLinea(L(0, "x", "10", "ud", "2,00", "18,00", 10, "10"))?.ok).toBe(true);
  });
  it("reports the difference when it does not add up", () => {
    expect(aritmeticaLinea(L(1, "refresco", "24", "ud", "0,95", "28,20"))).toMatchObject({ ok: false, esperadoCents: 2280, importeCents: 2820, difCents: 540 });
  });
});

// The "three notes on the counter" sample from the product spec.
const ctx: Contexto = {
  historial: [
    { proveedor: "Pescados del Musel", producto: "Merluza volanta", fecha: "2026-09-08", precioUnit: 10.5, unidad: "kg" },
    { proveedor: "Pescados del Musel", producto: "Merluza volanta", fecha: "2026-09-15", precioUnit: 10.7, unidad: "kg" },
    { proveedor: "Pescados del Musel", producto: "Merluza volanta", fecha: "2026-09-22", precioUnit: 10.7, unidad: "kg" },
    { proveedor: "Pescados del Musel", producto: "Merluza volanta", fecha: "2026-09-29", precioUnit: 10.9, unidad: "kg" },
    { proveedor: "Pescados del Musel", producto: "Bonito", fecha: "2026-09-29", precioUnit: 8.4, unidad: "kg" },
  ],
  registrados: [],
  pedidos: [{ proveedor: "Huerta La Vega", producto: "Tomate", cantidad: 18, unidad: "kg" }],
};

const musel = A("musel", "Pescados del Musel", "2026-10-06", [
  L(0, "Merluza volanta", "6,20", "kg", "11,90", "73,78"),
  L(1, "Bonito", "4,80", "kg", "8,40", "40,32"),
  L(2, "Rape", "2,10", "kg", "16,50", "34,65"),
], [T(10, "148,75", "14,88")], "163,63");

const huerta = A("huerta", "Huerta La Vega", "2026-10-06", [
  L(0, "Tomate", "12", "kg", "1,85", "22,20", 4),
  L(1, "Lechuga", "10", "ud", "0,65", "6,50", 4),
  L(2, "Cebolla", "10", "kg", "0,95", "9,50", 4),
  L(3, "Pimiento", "5", "kg", "2,40", "12,00", 4),
], [T(4, "50,20", "2,01")], "52,21");

const bebidas = A("bebidas", "Bebidas Cantábrico", "2026-10-06", [
  L(0, "Agua", "24", "ud", "0,35", "8,40", 10),
  L(1, "Refresco", "24", "ud", "0,95", "28,20", 10),
  L(2, "Cerveza barril", "30", "l", "2,10", "63,00", 21),
], [T(10, "36,60", "3,66"), T(21, "63,00", "13,23")], "116,49");

describe("checks on the spec sample", () => {
  it("flags the hake price rise: +11.2 %, 7.44 €", () => {
    const av = comprobar(musel, ctx);
    const subida = av.find((x) => x.codigo === "SUBIDA");
    expect(subida).toMatchObject({ lineaIdx: 0, centimos: 744 });
    expect(subida?.datos.pct).toBeCloseTo(11.2, 1);
    expect(totales(musel)?.ok).toBe(true);
    expect(sello(av)).toBe("CON_RESERVAS");
  });
  it("flags 6 kg of tomatoes missing: 11.10 €", () => {
    const av = comprobar(huerta, ctx);
    expect(av.find((x) => x.codigo === "FALTA")).toMatchObject({ lineaIdx: 0, centimos: 1110, datos: { faltan: 6 } });
    expect(sello(av)).toBe("CON_RESERVAS");
  });
  it("sends the wrong soft-drink line to investigation before calling it a supplier error", () => {
    const av = comprobar(bebidas, ctx);
    expect(av.map((x) => x.codigo)).toEqual(["ARITMETICA_LINEA"]);
    expect(av[0]).toMatchObject({ lineaIdx: 1, datos: { esperadoCents: 2280, impresoCents: 2820, difCents: 540 } });
    expect(totales(bebidas)?.ok).toBe(true); // two VAT rates on one page add up
    expect(sello(av)).toBe("REVISAR");
  });
  it("adds up the money at stake", () => {
    const av = [...comprobar(musel, ctx), ...comprobar(huerta, ctx), { codigo: "ERROR_PROVEEDOR" as const, clase: "dinero" as const, docId: "bebidas", lineaIdx: 1, centimos: 540, datos: {} }];
    expect(enJuego(av)).toEqual({ totalCents: 2394, desglose: { subidas: 744, faltas: 1110, erroresProveedor: 540, duplicados: 0 } });
  });
});

describe("honesty rules", () => {
  it("never stamps a note with unreadable fields as OK", () => {
    const a = { ...musel, ilegible: ["linea 1 importe"] };
    expect(sello(comprobar(a, { historial: [], registrados: [], pedidos: [] }))).toBe("REVISAR");
  });
  it("asks for review when the row count disagrees", () => {
    const a = { ...musel, filasContadas: 4 };
    expect(comprobar(a, { historial: [], registrados: [], pedidos: [] }).some((x) => x.codigo === "RECUENTO_FILAS")).toBe(true);
  });
  it("treats an implausible jump as a reading doubt, never as a price rise", () => {
    const a = A("x", "Pescados del Musel", "2026-10-06", [L(0, "Merluza volanta", "6,20", "kg", "19,00", "117,80")], [], null);
    const av = comprobar(a, ctx);
    expect(av.map((x) => x.codigo)).toContain("SALTO_RARO");
    expect(av.map((x) => x.codigo)).not.toContain("SUBIDA");
  });
  it("does not invent prices on unpriced notes", () => {
    const a = A("x", "Panadería", "2026-10-06", [L(0, "Pan", "20", "ud", null, null)], [], null);
    const av = comprobar(a, ctx);
    expect(av.map((x) => x.codigo)).toEqual(["SIN_PRECIOS"]);
    expect(sello(av)).toBe("CONFORME");
  });
  it("detects a duplicate note and puts its total at stake", () => {
    const a = { ...musel, numero: "A-1203" };
    const av = comprobar(a, { ...ctx, registrados: [{ docId: "old", proveedor: "Pescados del Musel", numero: "A-1203", fecha: "2026-10-01", totalCents: 16363 }] });
    expect(av.find((x) => x.codigo === "DUPLICADO")).toMatchObject({ centimos: 16363 });
  });
  it("flags totals that do not add up", () => {
    const a = { ...musel, total: parsePrinted("170,00") };
    expect(totales(a)).toMatchObject({ ok: false, motivo: "total" });
  });
});

describe("documents that print a decimal dot", () => {
  it("detects the document's decimal mark from unambiguous numbers", () => {
    expect(decimalMark(["152.92", "6.12", "13.800", "152.918"])).toBe(".");
    expect(decimalMark(["86,40", "8,64", "1.000"])).toBe(",");
    expect(decimalMark(["1.000", "2,000"])).toBeNull();
  });
  it("reads 152.918 as a decimal on a dot-decimal document", () => {
    expect(withDecimalMark(parsePrinted("152.918"), ".")?.candidates[0]).toBe(152.918);
    expect(withDecimalMark(parsePrinted("152.918"), ",")?.candidates[0]).toBe(152918);
  });
  it("reads a quantity with a unit suffix", () => {
    expect(parsePrinted("3U")?.candidates).toEqual([3]);
    expect(parsePrinted("12,00 kg")?.candidates).toEqual([12]);
  });
});

describe("two VAT rates without a rate on each line", () => {
  const sinTipo = (l: Linea) => ({ ...l, ivaPct: null });
  it("finds the only split of lines that matches the bases and fills the rates", () => {
    const a = { ...bebidas, lineas: bebidas.lineas.map(sinTipo) };
    expect(totales(a)?.ok).toBe(true);
    expect(inferirIva(a).lineas.map((l) => l.ivaPct)).toEqual([10, 10, 21]);
  });
  it("flags the note when no split matches the printed bases", () => {
    const a = { ...bebidas, lineas: bebidas.lineas.map(sinTipo), impuestos: [T(10, "40,00", "4,00"), T(21, "63,00", "13,23")] };
    expect(totales(a)).toMatchObject({ ok: false, motivo: "suma_base" });
  });
  it("fills the single rate when the table has one", () => {
    expect(inferirIva({ ...musel, lineas: musel.lineas.map(sinTipo) }).lineas.every((l) => l.ivaPct === 10)).toBe(true);
  });
});

describe("what changes the stamp", () => {
  it("an unreadable product name or tax ID does not, an unreadable amount does", () => {
    const vacio = { historial: [], registrados: [], pedidos: [] };
    expect(sello(comprobar({ ...musel, ilegible: ["linea 1 descripcion", "nif_proveedor"] }, vacio))).toBe("CONFORME");
    expect(sello(comprobar({ ...musel, ilegible: ["linea 1 importe"] }, vacio))).toBe("REVISAR");
    expect(sello(comprobar({ ...musel, noNumericos: ["linea 2 precio"] }, vacio))).toBe("REVISAR");
  });
});
