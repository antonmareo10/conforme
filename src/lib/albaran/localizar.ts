// Second, independent look at the line table: Spark locates each row on an enlarged crop of the table
// and copies its quantity, unit price and amount again WITHOUT seeing the first reading's numbers.
// Code then (1) snaps the boxes to the right rows and (2) flags every number where the two readings
// disagree. Measured on fictional notes: rows located correctly 20/20 (reading alone: 12-17/20).
import sharp from "sharp";
import { readerModel } from "../meta/models";
import type { ResponsesClient } from "../meta/privado";
import { readerClient, type Effort } from "./read";
import type { AlbaranLeido, Caja, Discrepancia, DiscrepanciaCabecera } from "./schema";
import { parsePrinted } from "../numbers";

const caja = {
  type: "object",
  additionalProperties: false,
  required: ["x_min", "y_min", "x_max", "y_max"],
  properties: { x_min: { type: "integer" }, y_min: { type: "integer" }, x_max: { type: "integer" }, y_max: { type: "integer" } },
};
const texto = { type: ["string", "null"] };

export interface SegundaLectura {
  filas: (Caja | null)[];
  importes: (Caja | null)[];
  textos: ({ cantidad: string | null; precio_unitario: string | null; importe: string | null } | null)[];
  ms: number;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
}

export async function localizarFilas(imagen: Buffer, leido: AlbaranLeido, opts: { client?: ResponsesClient; effort?: Effort } = {}): Promise<SegundaLectura> {
  const client = opts.client ?? readerClient();
  const model = readerModel();
  const t0 = Date.now();
  // Crop the table band (all rows read, with a margin) and enlarge it: more pixels per row.
  const { width: W = 1, height: H = 1 } = await sharp(imagen).metadata();
  const ys = leido.lineas.flatMap((l) => (l.caja_fila ? [l.caja_fila.y_min, l.caja_fila.y_max] : []));
  const alto = ys.length ? Math.max(...ys) - Math.min(...ys) : 1000;
  const margen = Math.max(60, alto * 0.35);
  const y0 = Math.max(0, ys.length ? Math.min(...ys) - margen : 0), y1 = Math.min(1000, ys.length ? Math.max(...ys) + margen : 1000);
  const top = Math.floor((y0 / 1000) * H), hh = Math.max(1, Math.ceil(((y1 - y0) / 1000) * H));
  const recorte = await sharp(imagen).extract({ left: 0, top, width: W, height: Math.min(hh, H - top) }).resize({ width: Math.min(2048, W * 2) }).jpeg({ quality: 90 }).toBuffer();
  const aPagina = (c: Caja | null): Caja | null => (c ? { x_min: c.x_min, x_max: c.x_max, y_min: Math.round(y0 + (c.y_min / 1000) * (y1 - y0)), y_max: Math.round(y0 + (c.y_max / 1000) * (y1 - y0)) } : null);
  // Only descriptions identify the rows: the numbers must be read again, independently.
  const lista = leido.lineas.map((l, i) => `${i + 1}. "${l.descripcion.texto ?? ""}"`).join("\n");
  const r = await client.responses.create({
    model,
    reasoning: { effort: opts.effort ?? "low" },
    input: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: `You are an object grounding expert. This is the line table of a Spanish supplier delivery note (a horizontal strip of the page). Find each of these product lines:\n${lista}\n` +
            "For each line: the box of the whole printed row (only that row's text height) and the box of its printed amount, on a 0-1000 grid of this image (origin top-left); " +
            "and copy, character by character exactly as printed, its quantity (for goods sold by weight, the weight), unit price and line amount (keep the comma; null if not printed). " +
            "Never compute or correct a number: if the printed numbers do not add up, copy them anyway. Keep the same order and count.",
        },
        { type: "input_image", image_url: `data:image/jpeg;base64,${recorte.toString("base64")}`, detail: "auto" },
      ],
    }],
    text: {
      format: {
        type: "json_schema",
        name: "filas",
        strict: true,
        schema: {
          type: "object", additionalProperties: false, required: ["filas"],
          properties: {
            filas: {
              type: "array",
              items: {
                type: "object", additionalProperties: false, required: ["n", "fila", "importe_caja", "cantidad", "precio_unitario", "importe"],
                properties: { n: { type: "integer" }, fila: caja, importe_caja: { ...caja, type: ["object", "null"] }, cantidad: texto, precio_unitario: texto, importe: texto },
              },
            },
          },
        },
      },
    },
  });
  type Fila = { n: number; fila: Caja; importe_caja: Caja | null; cantidad: string | null; precio_unitario: string | null; importe: string | null };
  const out = JSON.parse(r.output_text) as { filas: Fila[] };
  const de = (i: number) => out.filas.find((f) => f.n === i + 1);
  return {
    filas: leido.lineas.map((_, i) => aPagina(de(i)?.fila ?? null)),
    importes: leido.lineas.map((_, i) => aPagina(de(i)?.importe_caja ?? null)),
    textos: leido.lineas.map((_, i) => { const f = de(i); return f ? { cantidad: f.cantidad, precio_unitario: f.precio_unitario, importe: f.importe } : null; }),
    ms: Date.now() - t0,
    usage: r.usage,
  };
}

export interface LecturaTotales {
  impuestos: { iva_pct: string | null; base: string | null; cuota: string | null }[];
  total: string | null;
  ms: number;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
}

/**
 * Independent re-read of the money below the table (VAT rows and the total), WITHOUT seeing the first
 * reading. Measured on the real set: a blurry ticket read its VAT as 25,59 and its total as 147,42; both
 * add up with each other (and the VAT is within rounding), but the paper says 25,58 and 147,41.
 */
export async function releerTotales(imagen: Buffer, leido: AlbaranLeido, opts: { client?: ResponsesClient; effort?: Effort } = {}): Promise<LecturaTotales> {
  const client = opts.client ?? readerClient();
  const model = readerModel();
  const t0 = Date.now();
  const { width: W = 1, height: H = 1 } = await sharp(imagen).metadata();
  const ok = (c: Caja | null | undefined): c is Caja => !!c && c.y_max > c.y_min;
  const filas = leido.lineas.map((l) => l.caja_fila).filter(ok);
  const pie = [leido.total.caja, ...leido.impuestos.flatMap((t) => [t.base.caja, t.cuota.caja])].filter(ok);
  // From a little above the first box of the summary (or the last row) to the bottom of the page.
  const desde = Math.min(...pie.map((c) => c.y_min), filas.length ? Math.max(...filas.map((c) => c.y_max)) : 450);
  const y0 = Math.max(0, Math.min(desde, 900) - 60);
  const top = Math.floor((y0 / 1000) * H);
  const recorte = await sharp(imagen).extract({ left: 0, top, width: W, height: Math.max(1, H - top) }).resize({ width: Math.min(2048, W * 2) }).jpeg({ quality: 90 }).toBuffer();
  const texto = { type: ["string", "null"] };
  const r = await client.responses.create({
    model,
    reasoning: { effort: opts.effort ?? "low" },
    input: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: "This is the lower part of a Spanish supplier delivery note: the tax summary (VAT rows with rate %, taxable base and VAT amount) and the total of the note (the final amount to pay). " +
            "Copy, character by character exactly as printed, each VAT row's rate, base and VAT amount, and the total. Keep the comma. " +
            "Never compute or correct a number: if they do not add up, copy them anyway. Use null for anything not printed or not in the image.",
        },
        { type: "input_image", image_url: `data:image/jpeg;base64,${recorte.toString("base64")}`, detail: "auto" },
      ],
    }],
    text: {
      format: {
        type: "json_schema", name: "totales", strict: true,
        schema: {
          type: "object", additionalProperties: false, required: ["impuestos", "total"],
          properties: {
            impuestos: { type: "array", items: { type: "object", additionalProperties: false, required: ["iva_pct", "base", "cuota"], properties: { iva_pct: texto, base: texto, cuota: texto } } },
            total: texto,
          },
        },
      },
    },
  });
  const out = JSON.parse(r.output_text) as { impuestos: LecturaTotales["impuestos"]; total: string | null };
  return { ...out, ms: Date.now() - t0, usage: r.usage };
}

/** The total and every VAT base and amount where the two independent readings disagree. Missing = no opinion. */
export function compararTotales(leido: AlbaranLeido, otra: Pick<LecturaTotales, "impuestos" | "total">): DiscrepanciaCabecera[] {
  const out: DiscrepanciaCabecera[] = [];
  const distinto = (a: string | null, b: string | null) => a != null && b != null && !mismoNumero(a, b);
  if (distinto(leido.total.texto, otra.total)) out.push({ campo: "total", fila: 1, primera: leido.total.texto, segunda: otra.total });
  leido.impuestos.forEach((t, i) => {
    const par = otra.impuestos.find((o) => t.iva_pct.texto != null && o.iva_pct != null && mismoNumero(t.iva_pct.texto, o.iva_pct)) ?? (otra.impuestos.length === leido.impuestos.length ? otra.impuestos[i] : undefined);
    if (!par) return;
    for (const campo of ["base", "cuota"] as const) if (distinto(t[campo].texto, par[campo])) out.push({ campo, fila: i + 1, primera: t[campo].texto, segunda: par[campo] });
  });
  return out;
}

/** Same printed number? Compares values (both readings of ambiguous numbers), not characters. */
export function mismoNumero(a: string | null, b: string | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  const pa = parsePrinted(a), pb = parsePrinted(b);
  if (!pa || !pb) return a.replace(/\s/g, "") === b.replace(/\s/g, "");
  return pa.candidates.some((x) => pb.candidates.some((y) => Math.abs(x - y) < 1e-9));
}

/** Every money or quantity cell where the two independent readings disagree. */
export function compararLecturas(leido: AlbaranLeido, segunda: SegundaLectura): Discrepancia[] {
  const out: Discrepancia[] = [];
  leido.lineas.forEach((l, i) => {
    const t = segunda.textos[i];
    if (!t) return;
    for (const campo of ["cantidad", "precio_unitario", "importe"] as const) {
      const primera = l[campo].texto, otra = t[campo];
      if (primera == null && otra == null) continue;
      if (!mismoNumero(primera, otra)) out.push({ linea: i + 1, campo, primera, segunda: otra });
    }
  });
  return out;
}

/**
 * Put every line's boxes on the row found by the grounding call: the row keeps the reading's width
 * and takes the grounded height; the cells keep their columns and move to that row.
 */
export function afinarCajas(leido: AlbaranLeido, loc: Pick<SegundaLectura, "filas" | "importes">): AlbaranLeido {
  return {
    ...leido,
    lineas: leido.lineas.map((l, i) => {
      const f = loc.filas[i];
      if (!f) return l;
      const fila: Caja = { x_min: Math.min(l.caja_fila?.x_min ?? f.x_min, f.x_min), x_max: Math.max(l.caja_fila?.x_max ?? f.x_max, f.x_max), y_min: f.y_min, y_max: f.y_max };
      const aFila = <T extends { texto: string | null; caja: Caja | null }>(c: T): T => (c.caja ? { ...c, caja: { ...c.caja, y_min: f.y_min, y_max: f.y_max } } : c);
      const imp = loc.importes[i];
      return {
        ...l,
        caja_fila: fila,
        descripcion: aFila(l.descripcion),
        cantidad: aFila(l.cantidad),
        precio_unitario: aFila(l.precio_unitario),
        descuento_pct: aFila(l.descuento_pct),
        iva_pct: aFila(l.iva_pct),
        importe: imp && l.importe.texto ? { ...l.importe, caja: { ...imp, y_min: f.y_min, y_max: f.y_max } } : aFila(l.importe),
      };
    }),
  };
}

const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * Row boxes the reader got wrong are re-placed from their neighbours before anything crops by them:
 * rows are printed top to bottom at a steady pitch, so a row box with no height, or one out of the
 * printed order, is put where its neighbours say it is. Code moves boxes; it never touches a number.
 * (Seen on a recorded run: a row box of zero height above row 1 cut that row out of the table crop.)
 */
export function repararCajas(leido: AlbaranLeido): AlbaranLeido {
  const filas = leido.lineas.map((l) => l.caja_fila);
  const plausible = filas.map((c) => !!c && c.y_max - c.y_min >= 6 && c.x_max - c.x_min >= 50);
  // Keep the longest run of plausible rows whose tops go down the page in printed order.
  const idx = filas.map((_, i) => i).filter((i) => plausible[i]);
  const largo = idx.map(() => 1), prev = idx.map(() => -1);
  for (let a = 0; a < idx.length; a++)
    for (let b = 0; b < a; b++)
      if (filas[idx[b]]!.y_min < filas[idx[a]]!.y_min && largo[b] + 1 > largo[a]) { largo[a] = largo[b] + 1; prev[a] = b; }
  let k = largo.indexOf(Math.max(...largo, 0));
  const buenas = new Set<number>();
  while (k >= 0) { buenas.add(idx[k]); k = prev[k]; }
  if (!buenas.size || buenas.size === filas.length) return leido;

  const v = [...buenas].sort((a, b) => a - b);
  const alto = mediana(v.map((i) => filas[i]!.y_max - filas[i]!.y_min));
  const pasos = v.slice(1).map((j, n) => (filas[j]!.y_min - filas[v[n]]!.y_min) / (j - v[n]));
  const paso = pasos.length ? mediana(pasos) : alto * 1.4;
  return {
    ...leido,
    lineas: leido.lineas.map((l, i) => {
      if (buenas.has(i)) return l;
      const p = [...v].reverse().find((j) => j < i) ?? v[0];
      const ref = filas[p]!;
      const y_min = Math.round(Math.min(1000 - alto, Math.max(0, ref.y_min + (i - p) * paso)));
      const fila: Caja = { x_min: ref.x_min, x_max: ref.x_max, y_min, y_max: Math.round(y_min + alto) };
      const aFila = <T extends { texto: string | null; caja: Caja | null }>(c: T): T => (c.caja ? { ...c, caja: { ...c.caja, y_min: fila.y_min, y_max: fila.y_max } } : c);
      return { ...l, caja_fila: fila, descripcion: aFila(l.descripcion), cantidad: aFila(l.cantidad), precio_unitario: aFila(l.precio_unitario), descuento_pct: aFila(l.descuento_pct), importe: aFila(l.importe), iva_pct: aFila(l.iva_pct) };
    }),
  };
}
