// Run the whole pipeline N times on a sample and report the stamps and money each time.
import { readFileSync } from "node:fs";
import { analizar } from "../src/lib/pipeline";
import { ENCIMERA_CONTEXTO } from "../src/lib/demo/notas";
const n = Number(process.argv[2] ?? 3);
for (let i = 0; i < n; i++) {
  const linea: string[] = [];
  for await (const ev of analizar([readFileSync("public/muestras/encimera/escena.jpg")], ENCIMERA_CONTEXTO)) {
    if (ev.tipo === "lectura") linea.push(`${ev.docId}:disc=${ev.leido.discrepancias?.length ?? 0}`);
    if (ev.tipo === "investigacion") linea.push(`${ev.docId}:inv=${ev.veredicto}/${ev.valido ? "ok" : ev.motivo}`);
    if (ev.tipo === "resumen") linea.push(`enJuego=${ev.enJuegoCentimos} ${JSON.stringify(ev.sellos)}`);
    if (ev.tipo === "fin") linea.push(`${ev.ms}ms $${ev.costeUsd}`);
  }
  console.log(i + 1, linea.join(" | "));
}
