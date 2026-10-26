import { describe, expect, it } from "vitest";
import { responder, rango } from "./preguntas";
import type { AlbaranLeido } from "./albaran/schema";
import type { Aviso } from "./checks/types";

const campo = (texto: string | null) => ({ texto, caja: null });
const nota = (proveedor: string, fecha: string, lineas: [string, string, string, string][], total: string): AlbaranLeido => ({
  rotacion_para_leer: 0, proveedor: campo(proveedor), nif_proveedor: campo(null), numero: campo("1"), fecha: campo(fecha),
  lineas: lineas.map(([d, q, p, i]) => ({ descripcion: campo(d), cantidad: campo(q), unidad: "kg", precio_unitario: campo(p), descuento_pct: campo(null), importe: campo(i), iva_pct: campo("10"), caja_fila: null })),
  impuestos: [], total: campo(total), filas_de_producto_contadas: lineas.length, ilegible: [],
});
const subida = (docId: string, centimos: number): Aviso => ({ codigo: "SUBIDA", clase: "dinero", docId, lineaIdx: 0, centimos, datos: { pct: 8.5 } });

const docs = [
  { docId: "a", leido: nota("Cárnicas del Nalón", "09/09/2026", [["Ternera", "6,00", "14,20", "85,20"]], "93,72"), avisos: [] },
  { docId: "b", leido: nota("Cárnicas del Nalón", "23/09/2026", [["Ternera", "6,00", "15,40", "92,40"]], "101,64"), avisos: [subida("b", 720)] },
  { docId: "c", leido: nota("Pescados del Musel", "28/09/2026", [["Merluza", "6,20", "11,90", "73,78"]], "81,16"), avisos: [subida("c", 744)] },
];

describe("questions", () => {
  it("uses the latest note as 'today' for relative periods", () => {
    expect(rango("este_mes", [{ fecha: "2026-09-09" }, { fecha: "2026-09-28" }])).toEqual({ desde: "2026-09-01", hasta: "2026-09-28" });
  });
  it("adds up what was overpaid, and only for the supplier asked about", () => {
    expect(responder({ intencion: "PAGADO_DE_MAS", proveedor: null, producto: null, periodo: "este_mes" }, docs).cifraCentimos).toBe(1464);
    expect(responder({ intencion: "PAGADO_DE_MAS", proveedor: "Pescados del Musel", producto: null, periodo: "este_mes" }, docs).cifraCentimos).toBe(744);
  });
  it("sums a supplier's totals and points at each total", () => {
    const r = responder({ intencion: "GASTO_PROVEEDOR", proveedor: "Cárnicas del Nalón", producto: null, periodo: "todo" }, docs);
    expect(r.cifraCentimos).toBe(19536);
    expect(r.referencias.map((x) => x.lineaIdx)).toEqual([null, null]);
  });
  it("with no supplier named, ranks them and answers with the one who charged the most", () => {
    const r = responder({ intencion: "GASTO_PROVEEDOR", proveedor: null, producto: null, periodo: "todo" }, docs);
    expect(r.cifraCentimos).toBe(19536);
    expect(r.hechos.proveedor).toBe("Cárnicas del Nalón");
    expect(r.hechos.ranking).toBe("Pescados del Musel:8116");
    expect(r.referencias.map((x) => x.docId)).toEqual(["a", "b"]);
  });
  it("finds the last price of a product and its history", () => {
    const r = responder({ intencion: "ULTIMO_PRECIO", proveedor: null, producto: "Ternera", periodo: "todo" }, docs);
    expect(r.cifraCentimos).toBe(1540);
    expect(r.hechos.evolucion).toBe("1420,1540");
  });
});
