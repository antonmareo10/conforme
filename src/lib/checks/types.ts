import type { Caja } from "../albaran/schema";
import type { ParsedNumber } from "../numbers";

/** One product line after parsing the printed text. Money in cents. */
export interface Linea {
  idx: number;
  descripcion: string | null;
  unidad: string | null;
  cantidad: ParsedNumber | null;
  precio: ParsedNumber | null;
  descuentoPct: ParsedNumber | null;
  importe: ParsedNumber | null;
  ivaPct: number | null;
  cajas: { fila: Caja | null; cantidad: Caja | null; precio: Caja | null; importe: Caja | null; descripcion: Caja | null };
}

export interface Impuesto {
  ivaPct: number | null;
  base: ParsedNumber | null;
  cuota: ParsedNumber | null;
  cajas: { base: Caja | null; cuota: Caja | null };
}

export interface Albaran {
  docId: string;
  proveedor: string | null;
  nif: string | null;
  numero: string | null;
  /** ISO date (YYYY-MM-DD) when it could be parsed. */
  fecha: string | null;
  lineas: Linea[];
  impuestos: Impuesto[];
  total: ParsedNumber | null;
  filasContadas: number | null;
  ilegible: string[];
  /** Printed numeric fields whose text could not be read as a number (e.g. "1O,5O"). */
  noNumericos: string[];
  /** Cells where two independent readings disagree; a doubt until a zoomed re-read settles it. */
  discrepancias: { linea: number; campo: string; primera: string | null; segunda: string | null }[];
  /** The total or a VAT row read differently by two independent readings; a doubt until a zoomed re-read settles it. */
  discrepanciasCabecera?: { campo: "total" | "base" | "cuota"; fila: number; primera: string | null; segunda: string | null }[];
  /** Line VAT rates filled in by code (from the tax table), not printed on the line. */
  ivaInferido?: boolean;
  /**
   * Lines whose wrong arithmetic was confirmed on the paper by the investigator (line index →
   * evidence id). Code turns them into supplier errors; the model's word alone never does.
   */
  confirmados?: Record<number, string>;
  cajas: { proveedor: Caja | null; nif: Caja | null; numero: Caja | null; fecha: Caja | null; total: Caja | null };
}

/** A past purchase, for price history and duplicates. */
export interface Compra {
  proveedor: string;
  producto: string;
  fecha: string;
  precioUnit: number;
  unidad: string | null;
}

export interface AlbaranRegistrado {
  docId: string;
  proveedor: string;
  numero: string | null;
  fecha: string | null;
  totalCents: number | null;
}

export interface Pedido {
  proveedor: string;
  producto: string;
  cantidad: number;
  unidad: string | null;
}

export interface Contexto {
  historial: Compra[];
  registrados: AlbaranRegistrado[];
  pedidos: Pedido[];
}

export type CodigoAviso =
  | "ARITMETICA_LINEA" // a line does not add up and is not resolved yet
  | "ERROR_PROVEEDOR" // re-read confirmed: the supplier printed a wrong amount
  | "CELDA_REPARADA" // re-read fixed a misread cell (informational)
  | "TOTALES"
  | "NIF"
  | "RECUENTO_FILAS"
  | "DUPLICADO"
  | "FALTA"
  | "SOBRA"
  | "SUBIDA"
  | "SALTO_RARO"
  | "SIN_PRECIOS"
  | "ILEGIBLE";

export type ClaseAviso = "dinero" | "lectura" | "info";

export interface Aviso {
  codigo: CodigoAviso;
  clase: ClaseAviso;
  docId: string;
  lineaIdx?: number;
  /** Money at stake in cents (0 for reading or informational warnings). */
  centimos: number;
  /** Numbers the text templates need, already computed by code. */
  datos: Record<string, string | number>;
}

export type Sello = "CONFORME" | "CON_RESERVAS" | "REVISAR";

export const CLASE: Record<CodigoAviso, ClaseAviso> = {
  ARITMETICA_LINEA: "lectura",
  ERROR_PROVEEDOR: "dinero",
  CELDA_REPARADA: "info",
  TOTALES: "lectura",
  NIF: "info",
  RECUENTO_FILAS: "lectura",
  DUPLICADO: "dinero",
  FALTA: "dinero",
  SOBRA: "info",
  SUBIDA: "dinero",
  SALTO_RARO: "lectura",
  SIN_PRECIOS: "info",
  ILEGIBLE: "lectura",
};
