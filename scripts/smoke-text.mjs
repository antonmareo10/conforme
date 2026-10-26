// Day-0 smoke test: does the Meta Model API answer from here? Prints status and model ids, never the key.
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const key = env.MODEL_API_KEY;
const base = "https://api.meta.ai/v1";
const h = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const m = await fetch(`${base}/models`, { headers: h });
const mj = await m.json().catch(() => ({}));
console.log("GET /models", m.status, (mj.data || []).map((x) => x.id).join(", ") || JSON.stringify(mj).slice(0, 300));

const t0 = Date.now();
const r = await fetch(`${base}/responses`, {
  method: "POST", headers: h,
  body: JSON.stringify({ model: "muse-spark-1.3", input: "Reply with the single word: hola", reasoning: { effort: "minimal" } }),
});
const rj = await r.json().catch(() => ({}));
const text = rj.output_text ?? (rj.output || []).flatMap((o) => o.content || []).map((c) => c.text).filter(Boolean).join(" ");
console.log("POST /responses", r.status, `${Date.now() - t0} ms`, JSON.stringify(text || rj).slice(0, 300));
console.log("usage", JSON.stringify(rj.usage || {}));
for (const k of ["x-ratelimit-limit-requests", "x-ratelimit-remaining-requests", "x-ratelimit-limit-tokens"]) console.log(k, r.headers.get(k));
