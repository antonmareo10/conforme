// Day-0 smoke test: read one delivery note with Muse Spark 1.3, strict JSON schema, nullable fields and boxes.
// Usage: node scripts/smoke-read.mjs <image> [effort] [longSide]
// Prints timing, token usage and the parsed result. Never prints the API key.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import sharp from "sharp";
import OpenAI from "openai";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: env.MODEL_API_KEY });

const [img, effort = "low", longSide = "2048"] = process.argv.slice(2);
const jpeg = await sharp(img).rotate().resize({ width: +longSide, height: +longSide, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
const meta = await sharp(jpeg).metadata();

const box = {
  type: ["object", "null"],
  additionalProperties: false,
  required: ["x_min", "y_min", "x_max", "y_max"],
  properties: { x_min: { type: "integer" }, y_min: { type: "integer" }, x_max: { type: "integer" }, y_max: { type: "integer" } },
};
const field = {
  type: "object",
  additionalProperties: false,
  required: ["texto", "caja"],
  properties: { texto: { type: ["string", "null"] }, caja: box },
};
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["rotacion_para_leer", "proveedor", "nif_proveedor", "numero", "fecha", "lineas", "impuestos", "total", "filas_de_producto_contadas", "ilegible"],
  properties: {
    rotacion_para_leer: { type: "integer", enum: [0, 90, 180, 270] },
    proveedor: field, nif_proveedor: field, numero: field, fecha: field,
    lineas: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["descripcion", "cantidad", "unidad", "precio_unitario", "descuento_pct", "importe", "iva_pct", "caja_fila"],
        properties: {
          descripcion: field, cantidad: field, unidad: { type: ["string", "null"] }, precio_unitario: field,
          descuento_pct: field, importe: field, iva_pct: field, caja_fila: box,
        },
      },
    },
    impuestos: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["iva_pct", "base", "cuota"], properties: { iva_pct: field, base: field, cuota: field } },
    },
    total: field,
    filas_de_producto_contadas: { type: "integer" },
    ilegible: { type: "array", items: { type: "string" } },
  },
};

const prompt = `You read Spanish supplier delivery notes (albaranes) for a restaurant.
Return every product line exactly as printed. Copy numbers character by character as printed (keep the comma decimal separator), never compute or correct them.
If a field is not printed, use null. If it is printed but you cannot read it with certainty, put its name in "ilegible" (for example "linea 2 importe") and give your best reading.
For each field give its box on the image you received, on a 0-1000 grid (origin top-left): x_min, y_min, x_max, y_max. caja_fila is the box of the whole product row.
filas_de_producto_contadas: count the product rows you see on the paper, independently of the lines you extracted.
rotacion_para_leer: degrees clockwise the image must be rotated to be upright (0 if already upright). Boxes always refer to the image as sent.`;

const t0 = Date.now();
const r = await client.responses.create({
  model: "muse-spark-1.3",
  reasoning: { effort },
  input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}` }] }],
  text: { format: { type: "json_schema", name: "albaran", schema, strict: true } },
});
const ms = Date.now() - t0;
const out = JSON.parse(r.output_text);
console.log(basename(img), `${meta.width}x${meta.height}`, `${(jpeg.length / 1024).toFixed(0)} KB`, `effort=${effort}`, `${ms} ms`);
console.log("usage", JSON.stringify(r.usage));
console.log(JSON.stringify(out, null, 1).slice(0, 4000));
mkdirSync(new URL("../.smoke/", import.meta.url), { recursive: true });
writeFileSync(new URL(`../.smoke/${basename(img)}.${effort}.${longSide}.json`, import.meta.url), JSON.stringify({ ms, usage: r.usage, out }, null, 1));
