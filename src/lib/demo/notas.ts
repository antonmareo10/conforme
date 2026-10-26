// Fictional delivery notes for "Casa Nela" (Gijón). Every supplier, tax ID and price here is invented
// and every rendered page carries "DEMO · datos ficticios". Tax IDs use the obviously fake B0000000x range.

export type Plantilla = "a4" | "ticket" | "matricial" | "mano";

export interface LineaDemo {
  codigo?: string;
  descripcion: string;
  cantidad: number;
  decCantidad: number;
  unidad: string;
  precio: number;
  decPrecio: number;
  descuentoPct?: number;
  /** When set, the supplier printed this amount instead of the right one (a supplier error). */
  importeImpreso?: number;
  iva: number;
}

export interface NotaDemo {
  id: string;
  plantilla: Plantilla;
  proveedor: { nombre: string; nif: string; direccion: string; telefono: string };
  numero: string;
  fecha: string; // ISO
  lineas: LineaDemo[];
  /** Visual effects applied after rendering. */
  efectos?: { girar?: 90 | 270; tenue?: boolean; borroso?: number };
}

/** Fake but check-digit-valid CIF: B + 0000 + 3 digits + control. */
export function cifFicticio(n: number): string {
  const digits = `0000${String(n).padStart(3, "0")}`;
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = Number(digits[i]);
    if (i % 2 === 0) { const x = d * 2; sum += Math.floor(x / 10) + (x % 10); } else sum += d;
  }
  return `B${digits}${(10 - (sum % 10)) % 10}`;
}

export const PROVEEDORES = {
  musel: { nombre: "Pescados del Musel S.L.", nif: cifFicticio(101), direccion: "Lonja de El Musel, nave 4 · 33212 Gijón", telefono: "985 000 101" },
  huerta: { nombre: "Huerta La Vega", nif: cifFicticio(102), direccion: "Camín de la Vega 12 · 33392 Gijón", telefono: "985 000 102" },
  bebidas: { nombre: "Bebidas Cantábrico S.L.", nif: cifFicticio(103), direccion: "Pol. Ind. Roces, parcela 9 · 33211 Gijón", telefono: "985 000 103" },
  carnes: { nombre: "Cárnicas del Nalón", nif: cifFicticio(104), direccion: "Av. del Nalón 40 · 33930 Langreo", telefono: "985 000 104" },
} as const;

/** Money printed on the line: the supplier's printed amount if set, else qty × price × (1 − dto). */
export function importeLinea(l: LineaDemo): number {
  if (l.importeImpreso != null) return l.importeImpreso;
  return Math.round(l.cantidad * l.precio * (1 - (l.descuentoPct ?? 0) / 100) * 100) / 100;
}

export function impuestos(n: NotaDemo) {
  const porTipo = new Map<number, number>();
  for (const l of n.lineas) porTipo.set(l.iva, Math.round(((porTipo.get(l.iva) ?? 0) + importeLinea(l)) * 100) / 100);
  const filas = [...porTipo.entries()].sort((a, b) => a[0] - b[0]).map(([iva, base]) => ({ iva, base, cuota: Math.round(base * iva) / 100 }));
  const total = Math.round(filas.reduce((s, f) => s + f.base + f.cuota, 0) * 100) / 100;
  return { filas, total };
}

/** "Three delivery notes on the counter": the main sample of the product spec (23,94 € at stake). */
export const ENCIMERA: NotaDemo[] = [
  {
    id: "musel-1406",
    plantilla: "a4",
    proveedor: PROVEEDORES.musel,
    numero: "A-1406",
    fecha: "2026-10-06",
    lineas: [
      { codigo: "1012", descripcion: "Merluza volanta", cantidad: 6.2, decCantidad: 2, unidad: "kg", precio: 11.9, decPrecio: 2, iva: 10 },
      { codigo: "1031", descripcion: "Bonito del norte", cantidad: 4.8, decCantidad: 2, unidad: "kg", precio: 8.4, decPrecio: 2, iva: 10 },
      { codigo: "1044", descripcion: "Rape", cantidad: 2.1, decCantidad: 2, unidad: "kg", precio: 16.5, decPrecio: 2, iva: 10 },
    ],
  },
  {
    id: "huerta-0388",
    plantilla: "ticket",
    proveedor: PROVEEDORES.huerta,
    numero: "0388",
    fecha: "2026-10-06",
    lineas: [
      { descripcion: "Tomate", cantidad: 12, decCantidad: 3, unidad: "kg", precio: 1.85, decPrecio: 2, iva: 4 },
      { descripcion: "Lechuga", cantidad: 10, decCantidad: 0, unidad: "ud", precio: 0.65, decPrecio: 2, iva: 4 },
      { descripcion: "Cebolla", cantidad: 10, decCantidad: 3, unidad: "kg", precio: 0.95, decPrecio: 2, iva: 4 },
      { descripcion: "Pimiento", cantidad: 5, decCantidad: 3, unidad: "kg", precio: 2.4, decPrecio: 2, iva: 4 },
    ],
  },
  {
    id: "bebidas-77120",
    plantilla: "matricial",
    proveedor: PROVEEDORES.bebidas,
    numero: "77120",
    fecha: "2026-10-06",
    lineas: [
      { codigo: "AG05", descripcion: "Agua mineral 50 cl", cantidad: 24, decCantidad: 0, unidad: "ud", precio: 0.35, decPrecio: 3, iva: 10 },
      { codigo: "RF33", descripcion: "Refresco cola 33 cl", cantidad: 24, decCantidad: 0, unidad: "ud", precio: 0.95, decPrecio: 3, importeImpreso: 28.2, iva: 10 },
      { codigo: "CB30", descripcion: "Cerveza barril 30 l", cantidad: 30, decCantidad: 0, unidad: "l", precio: 2.1, decPrecio: 3, iva: 21 },
    ],
  },
];

/** Session context for the counter sample: six weeks of hake prices (median 10,70 €) and the vegetable order. */
export const ENCIMERA_CONTEXTO = {
  historial: [
    { proveedor: PROVEEDORES.musel.nombre, producto: "Merluza volanta", fecha: "2026-08-31", precioUnit: 10.5, unidad: "kg" },
    { proveedor: PROVEEDORES.musel.nombre, producto: "Merluza volanta", fecha: "2026-09-08", precioUnit: 10.6, unidad: "kg" },
    { proveedor: PROVEEDORES.musel.nombre, producto: "Merluza volanta", fecha: "2026-09-15", precioUnit: 10.7, unidad: "kg" },
    { proveedor: PROVEEDORES.musel.nombre, producto: "Merluza volanta", fecha: "2026-09-22", precioUnit: 10.7, unidad: "kg" },
    { proveedor: PROVEEDORES.musel.nombre, producto: "Merluza volanta", fecha: "2026-09-29", precioUnit: 10.9, unidad: "kg" },
    { proveedor: PROVEEDORES.musel.nombre, producto: "Bonito del norte", fecha: "2026-09-29", precioUnit: 8.4, unidad: "kg" },
    { proveedor: PROVEEDORES.musel.nombre, producto: "Rape", fecha: "2026-09-29", precioUnit: 16.5, unidad: "kg" },
  ],
  registrados: [],
  pedidos: [
    { proveedor: PROVEEDORES.huerta.nombre, producto: "Tomate", cantidad: 18, unidad: "kg" },
    { proveedor: PROVEEDORES.huerta.nombre, producto: "Lechuga", cantidad: 10, unidad: "ud" },
  ],
};
