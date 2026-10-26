// Compose several document images on a counter-like background, slightly rotated, to test SAM separation.
// Usage: node scripts/make-scene.mjs <out.jpg> <img1> <img2> [img3...]
// Writes <out.jpg> and <out.jpg>.truth.json with each document's placed box (pixels).
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const [out, ...imgs] = process.argv.slice(2);
const W = 2400, H = 1700;
// Steel-grey counter with a little noise so it is not a flat colour.
const noise = Buffer.alloc(W * H * 3);
for (let i = 0; i < noise.length; i += 3) { const v = 120 + Math.floor(Math.random() * 18); noise[i] = v; noise[i + 1] = v + 4; noise[i + 2] = v + 8; }
const bg = sharp(noise, { raw: { width: W, height: H, channels: 3 } }).blur(1.2);

const slots = [[80, 140], [860, 90], [1640, 180], [400, 900], [1300, 950]];
const angles = [-7, 4, -3, 6, -5];
const layers = [];
const truth = [];
for (let i = 0; i < imgs.length; i++) {
  const doc = await sharp(imgs[i]).rotate().resize({ width: 700, height: 980, fit: "inside" }).toBuffer();
  const rotated = await sharp(doc).rotate(angles[i], { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const m = await sharp(rotated).metadata();
  const [left, top] = slots[i];
  // soft shadow
  const shadow = await sharp(rotated).ensureAlpha().modulate({ brightness: 0 }).blur(12).png().toBuffer();
  layers.push({ input: shadow, left: left + 14, top: top + 18, blend: "multiply" });
  layers.push({ input: rotated, left, top });
  truth.push({ file: imgs[i].split(/[\\/]/).pop(), left, top, right: left + m.width, bottom: top + m.height, angle: angles[i] });
}
await bg.composite(layers).jpeg({ quality: 88 }).toFile(out);
writeFileSync(out + ".truth.json", JSON.stringify({ width: W, height: H, docs: truth }, null, 1));
console.log("wrote", out, truth.length, "documents");
