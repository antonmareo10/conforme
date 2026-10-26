// Row box accuracy: boxes returned with the reading vs a dedicated grounding call.
// Usage: npx tsx --env-file=.env.local eval/cajas.mts [set] [repeticiones]
import { readFileSync } from "node:fs";
import { readAlbaran } from "../src/lib/albaran/read";
import { localizarFilas } from "../src/lib/albaran/localizar";
import type { AlbaranLeido, Caja } from "../src/lib/albaran/schema";

const set = process.argv[2] ?? "encimera";
const reps = Number(process.argv[3] ?? 2);
const notas = JSON.parse(readFileSync(`src/data/muestras/${set}.json`, "utf8")) as { id: string; imagen: string; verdad: AlbaranLeido }[];

const iou = (a: Caja, b: Caja) => {
  const ix = Math.max(0, Math.min(a.x_max, b.x_max) - Math.max(a.x_min, b.x_min));
  const iy = Math.max(0, Math.min(a.y_max, b.y_max) - Math.max(a.y_min, b.y_min));
  const inter = ix * iy;
  return inter / ((a.x_max - a.x_min) * (a.y_max - a.y_min) + (b.x_max - b.x_min) * (b.y_max - b.y_min) - inter);
};
// Is the predicted row centred on the true row (not on a neighbour)?
const enSuFila = (p: Caja, t: Caja) => { const cy = (p.y_min + p.y_max) / 2; return cy >= t.y_min && cy <= t.y_max; };

const acc = { lectura: { iou: 0, fila: 0, n: 0 }, dedicada: { iou: 0, fila: 0, n: 0 }, hibrida: { iou: 0, fila: 0, n: 0 } };
for (let r = 0; r < reps; r++)
  for (const n of notas) {
    const res = await readAlbaran(readFileSync(`public${n.imagen}`));
    const loc = await localizarFilas(res.imagen!, res.leido);
    n.verdad.lineas.forEach((t, i) => {
      if (!t.caja_fila) return;
      const a = res.leido.lineas[i]?.caja_fila, b = loc.filas[i];
      if (a) { acc.lectura.n++; acc.lectura.iou += iou(a, t.caja_fila); acc.lectura.fila += +enSuFila(a, t.caja_fila); }
      if (b) { acc.dedicada.n++; acc.dedicada.iou += iou(b, t.caja_fila); acc.dedicada.fila += +enSuFila(b, t.caja_fila); }
      const h = a && b ? { x_min: a.x_min, x_max: a.x_max, y_min: b.y_min, y_max: b.y_max } : null;
      if (h) { acc.hibrida.n++; acc.hibrida.iou += iou(h, t.caja_fila); acc.hibrida.fila += +enSuFila(h, t.caja_fila); }
    });
    console.log(r, n.id, `grounding ${loc.ms} ms`);
  }
for (const [k, v] of Object.entries(acc)) console.log(k, "rows", v.n, "mean IoU", (v.iou / v.n).toFixed(3), "centred on the right row", `${v.fila}/${v.n}`);
