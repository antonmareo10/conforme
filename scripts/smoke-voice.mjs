// Day-0 smoke test for Muse Voice Transcribe (WAV only, multipart). Never prints the API key.
// Usage: node scripts/smoke-voice.mjs <file.wav> [mode]
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const [wav, mode = "PUSH_TO_TALK"] = process.argv.slice(2);
const fd = new FormData();
fd.append("request", new Blob([JSON.stringify({ model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode })], { type: "application/json" }));
fd.append("audio", new Blob([readFileSync(wav)], { type: "audio/wav" }), "q.wav");
const t0 = Date.now();
const r = await fetch("https://api.meta.ai/v1/asr/transcribe", { method: "POST", headers: { Authorization: `Bearer ${env.MODEL_API_KEY}`, Accept: "application/json" }, body: fd });
console.log(r.status, `${Date.now() - t0} ms`);
console.log((await r.text()).slice(0, 1500));
