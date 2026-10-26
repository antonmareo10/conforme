// Record a real pipeline run (events with their real timings) as a replay for a fictional sample.
// Usage: npx tsx --env-file=.env.local scripts/grabar-muestra.mts encimera
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { analizar } from "../src/lib/pipeline";
import { ENCIMERA_CONTEXTO } from "../src/lib/demo/notas";

const id = process.argv[2] ?? "encimera";
const MUESTRAS: Record<string, { fotos: string[]; ctx: typeof ENCIMERA_CONTEXTO }> = {
  encimera: { fotos: ["public/muestras/encimera/escena.jpg"], ctx: ENCIMERA_CONTEXTO },
};
const m = MUESTRAS[id];
const t0 = Date.now();
const eventos: { t: number; ev: unknown }[] = [];
for await (const ev of analizar(m.fotos.map((f) => readFileSync(f)), m.ctx)) {
  eventos.push({ t: Date.now() - t0, ev });
  if ((ev as { tipo: string }).tipo === "fin") console.log(JSON.stringify(ev));
}
mkdirSync("src/data/replays", { recursive: true });
writeFileSync(`src/data/replays/${id}.json`, JSON.stringify({ id, grabado: new Date().toISOString(), modelo: "muse-spark-1.3 + sam-3.1", contexto: m.ctx, eventos }));
console.log("recorded", eventos.length, "events");
