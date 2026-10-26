// What Muse Spark returns when it reads one delivery note: printed text copied as-is, plus a box
// on a 0-1000 grid of the image it received. Strict JSON schema (nullable fields verified on day 0).

export interface Caja {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

export interface Campo {
  texto: string | null;
  caja: Caja | null;
}

export interface LineaLeida {
  descripcion: Campo;
  cantidad: Campo;
  unidad: string | null;
  precio_unitario: Campo;
  descuento_pct: Campo;
  importe: Campo;
  iva_pct: Campo;
  caja_fila: Caja | null;
}

export interface ImpuestoLeido {
  iva_pct: Campo;
  base: Campo;
  cuota: Campo;
}

/** Two independent readings of one printed number that do not agree (set by code, not by the model). */
export interface Discrepancia {
  linea: number; // 1-based
  campo: "cantidad" | "precio_unitario" | "importe";
  primera: string | null;
  segunda: string | null;
}

export interface AlbaranLeido {
  rotacion_para_leer: 0 | 90 | 180 | 270;
  proveedor: Campo;
  nif_proveedor: Campo;
  numero: Campo;
  fecha: Campo;
  lineas: LineaLeida[];
  impuestos: ImpuestoLeido[];
  total: Campo;
  filas_de_producto_contadas: number;
  ilegible: string[];
  /** Added by code after the second, independent reading of the line table. */
  discrepancias?: Discrepancia[];
}

const caja = {
  type: ["object", "null"],
  additionalProperties: false,
  required: ["x_min", "y_min", "x_max", "y_max"],
  properties: {
    x_min: { type: "integer" },
    y_min: { type: "integer" },
    x_max: { type: "integer" },
    y_max: { type: "integer" },
  },
} as const;

const campo = {
  type: "object",
  additionalProperties: false,
  required: ["texto", "caja"],
  properties: { texto: { type: ["string", "null"] }, caja },
} as const;

export const ALBARAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "rotacion_para_leer", "proveedor", "nif_proveedor", "numero", "fecha",
    "lineas", "impuestos", "total", "filas_de_producto_contadas", "ilegible",
  ],
  properties: {
    rotacion_para_leer: { type: "integer", enum: [0, 90, 180, 270] },
    proveedor: campo,
    nif_proveedor: campo,
    numero: campo,
    fecha: campo,
    lineas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["descripcion", "cantidad", "unidad", "precio_unitario", "descuento_pct", "importe", "iva_pct", "caja_fila"],
        properties: {
          descripcion: campo,
          cantidad: campo,
          unidad: { type: ["string", "null"] },
          precio_unitario: campo,
          descuento_pct: campo,
          importe: campo,
          iva_pct: campo,
          caja_fila: caja,
        },
      },
    },
    impuestos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["iva_pct", "base", "cuota"],
        properties: { iva_pct: campo, base: campo, cuota: campo },
      },
    },
    total: campo,
    filas_de_producto_contadas: { type: "integer" },
    ilegible: { type: "array", items: { type: "string" } },
  },
} as const;

export const READ_PROMPT = `You read Spanish supplier delivery notes (albaranes) for a restaurant.
Return every product line exactly as printed. "cantidad" is the quantity the unit price applies to: for goods sold by weight it is the weight (kg), not the number of pieces or boxes printed next to it. Copy numbers character by character as printed (keep the comma decimal separator), never compute or correct them.
If a field is not printed, use null. If it is printed but you cannot read it with certainty, put its name in "ilegible" (for example "linea 2 importe") and give your best reading.
For each field give its box on the image you received, on a 0-1000 grid (origin top-left): x_min, y_min, x_max, y_max. caja_fila is the box of the whole product row.
filas_de_producto_contadas: count the product rows you see on the paper, independently of the lines you extracted.
rotacion_para_leer: degrees clockwise the image must be rotated to be upright (0 if already upright). Boxes always refer to the image as sent.`;
