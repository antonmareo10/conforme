// Render fictional delivery notes to images with their true field boxes.
// Usage: npx tsx scripts/gen/render.mts            (renders the "encimera" sample)
// Output: public/muestras/<set>/<id>.jpg and src/data/muestras/<set>.json (truth in the reading schema).
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";
import { ENCIMERA, importeLinea, impuestos, type NotaDemo } from "../../src/lib/demo/notas";
import type { AlbaranLeido, Caja, Campo } from "../../src/lib/albaran/schema";
import { html, es } from "./templates.mts";

type Boxes = Record<string, { x: number; y: number; w: number; h: number }>;

const SETS: Record<string, NotaDemo[]> = { encimera: ENCIMERA };

function toGrid(b: { x: number; y: number; w: number; h: number } | undefined, W: number, H: number): Caja | null {
  if (!b) return null;
  return {
    x_min: Math.round((b.x / W) * 1000),
    y_min: Math.round((b.y / H) * 1000),
    x_max: Math.round(((b.x + b.w) / W) * 1000),
    y_max: Math.round(((b.y + b.h) / H) * 1000),
  };
}

/** Boxes follow a clockwise rotation of the page by `deg`. */
function rotateBox(c: Caja | null, deg: 0 | 90 | 270): Caja | null {
  if (!c || deg === 0) return c;
  if (deg === 90) return { x_min: 1000 - c.y_max, x_max: 1000 - c.y_min, y_min: c.x_min, y_max: c.x_max };
  return { x_min: c.y_min, x_max: c.y_max, y_min: 1000 - c.x_max, y_max: 1000 - c.x_min };
}

function truth(n: NotaDemo, box: (k: string) => Caja | null, giro: 0 | 90 | 270): AlbaranLeido {
  const imp = impuestos(n);
  const campo = (k: string, texto: string | null): Campo => ({ texto, caja: texto == null ? null : box(k) });
  const fechaImpresa = n.plantilla === "ticket" ? `${n.fecha.slice(8, 10)}/${n.fecha.slice(5, 7)}/${n.fecha.slice(2, 4)}` : `${n.fecha.slice(8, 10)}/${n.fecha.slice(5, 7)}/${n.fecha.slice(0, 4)}`;
  const upper = n.plantilla !== "a4";
  return {
    rotacion_para_leer: ((360 - giro) % 360) as AlbaranLeido["rotacion_para_leer"],
    proveedor: campo("proveedor", upper ? n.proveedor.nombre.toUpperCase() : n.proveedor.nombre),
    nif_proveedor: campo("nif_proveedor", n.proveedor.nif),
    numero: campo("numero", n.numero),
    fecha: campo("fecha", fechaImpresa),
    lineas: n.lineas.map((l, i) => ({
      descripcion: campo(`linea-${i}-descripcion`, upper ? l.descripcion.toUpperCase() : l.descripcion),
      cantidad: campo(`linea-${i}-cantidad`, es(l.cantidad, l.decCantidad)),
      unidad: l.unidad,
      precio_unitario: campo(`linea-${i}-precio_unitario`, es(l.precio, l.decPrecio)),
      descuento_pct: campo(`linea-${i}-descuento_pct`, l.descuentoPct ? es(l.descuentoPct, 0) : null),
      importe: campo(`linea-${i}-importe`, es(importeLinea(l), 2)),
      iva_pct: campo(`linea-${i}-iva_pct`, n.plantilla === "ticket" ? null : String(l.iva)),
      caja_fila: box(`linea-${i}-fila`),
    })),
    impuestos: imp.filas.map((t, j) => ({
      iva_pct: campo(`imp-${j}-iva_pct`, es(t.iva, 2)),
      base: campo(`imp-${j}-base`, es(t.base, 2)),
      cuota: campo(`imp-${j}-cuota`, es(t.cuota, 2)),
    })),
    total: campo("total", es(imp.total, 2)),
    filas_de_producto_contadas: n.lineas.length,
    ilegible: [],
  };
}

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1000, height: 1400 } });

for (const [set, notas] of Object.entries(SETS)) {
  const imgDir = `public/muestras/${set}`;
  mkdirSync(imgDir, { recursive: true });
  mkdirSync("src/data/muestras", { recursive: true });
  const out: { id: string; imagen: string; width: number; height: number; verdad: AlbaranLeido }[] = [];
  for (const n of notas) {
    await page.setContent(html(n), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const paper = page.locator(".paper");
    const pb = (await paper.boundingBox())!;
    const boxes: Boxes = await page.evaluate(() => {
      const p = document.querySelector(".paper")!.getBoundingClientRect();
      const o: Record<string, { x: number; y: number; w: number; h: number }> = {};
      document.querySelectorAll<HTMLElement>("[data-f]").forEach((el) => {
        const r = el.getBoundingClientRect();
        o[el.dataset.f!] = { x: r.x - p.x, y: r.y - p.y, w: r.width, h: r.height };
      });
      return o;
    });
    let img = sharp(await paper.screenshot({ type: "png" }));
    const giro = (n.efectos?.girar ?? 0) as 0 | 90 | 270;
    if (n.efectos?.tenue) img = img.linear(0.55, 255 * 0.45);
    if (n.efectos?.borroso) img = img.blur(n.efectos.borroso);
    if (giro) img = img.rotate(giro);
    const jpeg = await img.jpeg({ quality: 88 }).toBuffer();
    const { width = 0, height = 0 } = await sharp(jpeg).metadata();
    writeFileSync(`${imgDir}/${n.id}.jpg`, jpeg);
    const box = (k: string) => rotateBox(toGrid(boxes[k], pb.width, pb.height), giro);
    out.push({ id: n.id, imagen: `/muestras/${set}/${n.id}.jpg`, width, height, verdad: truth(n, box, giro) });
    console.log(set, n.id, `${width}x${height}`, Object.keys(boxes).length, "fields");
  }
  writeFileSync(`src/data/muestras/${set}.json`, JSON.stringify(out, null, 1));
}
await browser.close();
