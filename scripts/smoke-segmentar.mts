// Split and straighten the notes of one photo; writes each crop to .smoke/seg_<docId>.jpg.
// Usage: npx tsx --env-file=.env.local scripts/smoke-segmentar.mts <photo>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { segmentar } from "../src/lib/segmentar";
const s = await segmentar(readFileSync(process.argv[2]));
mkdirSync(".smoke", { recursive: true });
console.log("prompt", s.prompt, "docs", s.documentos.length, `${s.ms} ms`, "foto", s.foto);
for (const d of s.documentos) {
  writeFileSync(`.smoke/seg_${d.docId}.jpg`, d.jpeg);
  console.log(d.docId, `${d.width}x${d.height}`, "angulo", d.enFoto.angulo.toFixed(1), "conf", d.confianza?.toFixed(2), "contorno", d.enFoto.contornoSVG ? d.enFoto.contornoSVG.length : 0);
}
