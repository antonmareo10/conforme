// Draw the boxes from a smoke-read result on the image, to check grounding by eye.
// Usage: node scripts/smoke-overlay.mjs <image> <result.json> <out.jpg> [longSide]
import { readFileSync } from "node:fs";
import sharp from "sharp";

const [img, resPath, outPath, longSide = "2048"] = process.argv.slice(2);
const { out } = JSON.parse(readFileSync(resPath, "utf8"));
const base = sharp(img).rotate().resize({ width: +longSide, height: +longSide, fit: "inside", withoutEnlargement: true });
const buf = await base.jpeg().toBuffer();
const { width: W, height: H } = await sharp(buf).metadata();

const rects = [];
const add = (c, color) => c && rects.push(
  `<rect x="${(c.x_min / 1000) * W}" y="${(c.y_min / 1000) * H}" width="${((c.x_max - c.x_min) / 1000) * W}" height="${((c.y_max - c.y_min) / 1000) * H}" fill="none" stroke="${color}" stroke-width="4"/>`);
for (const k of ["proveedor", "nif_proveedor", "numero", "fecha", "total"]) add(out[k]?.caja, "#1E4FA8");
for (const l of out.lineas ?? []) {
  add(l.caja_fila, "#2E7D4F");
  for (const k of ["cantidad", "precio_unitario", "importe"]) add(l[k]?.caja, "#C2362B");
}
for (const t of out.impuestos ?? []) for (const k of ["base", "cuota"]) add(t[k]?.caja, "#E08A00");
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rects.join("")}</svg>`);
const drawn = await sharp(buf).composite([{ input: svg }]).jpeg().toBuffer();
await sharp(drawn).resize({ width: 900 }).jpeg({ quality: 80 }).toFile(outPath);
console.log("wrote", outPath, rects.length, "boxes");
