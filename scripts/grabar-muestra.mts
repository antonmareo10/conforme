// Record a real pipeline run (events with their real timings) as a replay for a fictional sample.
// Usage: npx tsx --env-file=.env.local scripts/grabar-muestra.mts encimera [output-id]
// Private mode (PRIVATE_MODEL_BASE_URL set) records the same sample read by the open-weight model, e.g.
//   ... scripts/grabar-muestra.mts encimera encimera-abierto
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { analizar } from "../src/lib/pipeline";
import { ENCIMERA_CONTEXTO } from "../src/lib/demo/notas";
import { readerModel } from "../src/lib/meta/models";
import { privateModeConfig } from "../src/lib/meta/privado";

const id = process.argv[2] ?? "encimera";
const salida = process.argv[3] ?? id;
const privado = privateModeConfig();
if (salida === id && privado) throw new Error("Private-mode recordings need their own output id; they never replace the Muse Spark sample.");
const modelo = `${readerModel()}${privado ? ` (open weights, ${new URL(privado.baseURL).hostname})` : ""} + sam-3.1`;
const MUESTRAS: Record<string, { fotos: string[]; ctx: typeof ENCIMERA_CONTEXTO }> = {
  encimera: { fotos: ["public/muestras/encimera/escena.jpg"], ctx: ENCIMERA_CONTEXTO },
  girado: { fotos: ["public/muestras/girado/carnes-girado.jpg"], ctx: { historial: [], registrados: [], pedidos: [] } },
};
const m = MUESTRAS[id];
const t0 = Date.now();
const eventos: { t: number; ev: unknown }[] = [];
for await (const ev of analizar(m.fotos.map((f) => readFileSync(f)), m.ctx)) {
  eventos.push({ t: Date.now() - t0, ev });
  if ((ev as { tipo: string }).tipo === "fin") console.log(JSON.stringify(ev));
}
mkdirSync("public/replays", { recursive: true });
writeFileSync(`public/replays/${salida}.json`, JSON.stringify({ id: salida, grabado: new Date().toISOString(), modelo, contexto: m.ctx, eventos }));
console.log("recorded", eventos.length, "events");
