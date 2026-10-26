// Day-0 smoke test for SAM 3.1 concept prompts.
// Usage: node scripts/smoke-sam.mjs <image> "<noun phrase>" [more phrases...]
//        node scripts/smoke-sam.mjs --counts <dir-with-COUNTS.json>   (counting benchmark on public photos)
// Prints instance count, confidences and boxes per phrase. Never prints the API key.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import sharp from "sharp";
import OpenAI from "openai";
import { parseImageStream, recordsOfKind } from "@meta-sam/parser";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: env.MODEL_API_KEY });

export async function segment(imgPath, phrase, longSide = 1600) {
  const jpeg = await sharp(imgPath).rotate().resize({ width: longSide, height: longSide, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  const { width, height } = await sharp(jpeg).metadata();
  const t0 = Date.now();
  const stream = await client.responses.create({
    model: "sam-3.1",
    stream: true,
    metadata: { include_confidence: "true" },
    input: [{ role: "user", content: [{ type: "input_text", text: phrase }, { type: "input_image", image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}` }] }],
  });
  const result = await parseImageStream(stream).finalResult;
  const boxes = recordsOfKind(result.records, "box");
  const masks = recordsOfKind(result.records, "mask");
  return { phrase, width, height, ms: Date.now() - t0, n: boxes.length, boxes, masks, outcome: result.outcome, diagnostics: result.diagnostics, raw: result.rawOutput.slice(0, 400) };
}

const args = process.argv.slice(2);
if (args[0] === "--counts") {
  const dir = args[1];
  const counts = JSON.parse(readFileSync(join(dir, "COUNTS.json"), "utf8"));
  const rows = [];
  for (const [file, info] of Object.entries(counts)) {
    for (const [concept, truth] of Object.entries(info.counts)) {
      const phrase = concept.replace(/_/g, " ");
      try {
        const r = await segment(join(dir, file), phrase);
        const conf = r.boxes.map((b) => b.confidence ?? b.score).filter((x) => x != null);
        const n05 = conf.length ? conf.filter((c) => c >= 0.5).length : r.n;
        rows.push({ file, phrase, truth, n: r.n, n05, exacto: info.exacto, dudoso: info.dudoso, ms: r.ms });
        console.log(file, phrase.padEnd(16), "truth", truth, "sam", r.n, "conf>=0.5", n05, `${r.ms} ms`);
      } catch (e) {
        console.log(file, phrase, "ERROR", e.status ?? "", String(e.message).slice(0, 200));
      }
    }
  }
  const ok = rows.filter((r) => r.n05 === r.truth).length;
  const near = rows.filter((r) => Math.abs(r.n05 - r.truth) <= 1).length;
  console.log(`exact ${ok}/${rows.length}, within 1: ${near}/${rows.length}`);
  mkdirSync(new URL("../.smoke/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../.smoke/sam_counts.json", import.meta.url), JSON.stringify(rows, null, 1));
} else {
  const [img, ...phrases] = args;
  for (const p of phrases) {
    const r = await segment(img, p);
    console.log(basename(img), JSON.stringify(p), `${r.width}x${r.height}`, `${r.ms} ms`, "instances", r.n, r.outcome.status);
    for (const b of r.boxes) console.log("  ", JSON.stringify({ id: b.objectId, bounds: b.bounds ?? b.box, conf: b.confidence ?? b.score, keys: Object.keys(b) }));
    if (r.diagnostics.length) console.log("  diagnostics", JSON.stringify(r.diagnostics).slice(0, 300));
    if (!r.n) console.log("  raw", JSON.stringify(r.raw));
  }
}
