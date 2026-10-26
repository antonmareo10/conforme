// Generate fictional scene backgrounds with Muse Image (labelled as generated wherever shown).
// Usage: npx tsx --env-file=.env.local scripts/fondo-muse-image.mts <out.jpg> "<prompt>"
import { writeFileSync } from "node:fs";
import OpenAI from "openai";
import { assertAllowedModel, MODELS } from "../src/lib/meta/models";
const [out, prompt] = process.argv.slice(2);
assertAllowedModel(MODELS.image);
const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.MODEL_API_KEY });
const t0 = Date.now();
const r = await client.images.generate({ model: MODELS.image, prompt, size: "1536x1024" as never, n: 1 });
const d = r.data?.[0];
if (d?.b64_json) writeFileSync(out, Buffer.from(d.b64_json, "base64"));
else if (d?.url) writeFileSync(out, Buffer.from(await (await fetch(d.url)).arrayBuffer()));
else { console.log(JSON.stringify(r).slice(0, 500)); process.exit(1); }
console.log("wrote", out, `${Date.now() - t0} ms`);
