// Box accuracy on fictional notes, where the true box of every field is known from the renderer.
// Usage: npx tsx --env-file=.env.local eval/synthetic.mts [set] [--effort low]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { readAlbaran, type Effort } from "../src/lib/albaran/read";
import type { AlbaranLeido, Caja } from "../src/lib/albaran/schema";

const set = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "encimera";
const i = process.argv.indexOf("--effort");
const effort = (i > 0 ? process.argv[i + 1] : "low") as Effort;
const notas = JSON.parse(readFileSync(`src/data/muestras/${set}.json`, "utf8")) as { id: string; imagen: string; verdad: AlbaranLeido }[];

const iou = (a: Caja, b: Caja) => {
  const ix = Math.max(0, Math.min(a.x_max, b.x_max) - Math.max(a.x_min, b.x_min));
  const iy = Math.max(0, Math.min(a.y_max, b.y_max) - Math.max(a.y_min, b.y_min));
  const inter = ix * iy;
  const ua = (a.x_max - a.x_min) * (a.y_max - a.y_min) + (b.x_max - b.x_min) * (b.y_max - b.y_min) - inter;
  return ua > 0 ? inter / ua : 0;
};
const center = (c: Caja) => ({ x: (c.x_min + c.x_max) / 2, y: (c.y_min + c.y_max) / 2 });

function pairs(t: AlbaranLeido, p: AlbaranLeido) {
  const out: { k: string; t: { texto: string | null; caja: Caja | null }; p: { texto: string | null; caja: Caja | null } }[] = [];
  for (const k of ["proveedor", "nif_proveedor", "numero", "fecha", "total"] as const) out.push({ k, t: t[k], p: p[k] });
  t.lineas.forEach((l, j) => {
    const q = p.lineas[j];
    if (!q) return;
    for (const k of ["descripcion", "cantidad", "precio_unitario", "importe"] as const) out.push({ k: `linea${j}.${k}`, t: l[k], p: q[k] });
  });
  t.impuestos.forEach((x, j) => {
    const q = p.impuestos[j];
    if (!q) return;
    for (const k of ["base", "cuota"] as const) out.push({ k: `imp${j}.${k}`, t: x[k], p: q[k] });
  });
  return out;
}

const rows: { k: string; texto: boolean; iou: number | null; dx: number | null; dy: number | null }[] = [];
for (const n of notas) {
  const img = readFileSync(`public${n.imagen}`);
  const r = await readAlbaran(img, { effort });
  mkdirSync(".smoke/synthetic", { recursive: true });
  writeFileSync(`.smoke/synthetic/${n.id}.${effort}.json`, JSON.stringify({ ...r, imagen: undefined }, null, 1));
  for (const { k, t, p } of pairs(n.verdad, r.leido)) {
    if (!t.caja) continue;
    const ok = (t.texto ?? "").replace(/\s/g, "").toLowerCase() === (p.texto ?? "").replace(/\s/g, "").toLowerCase();
    const io = p.caja ? iou(t.caja, p.caja) : null;
    const d = p.caja ? { dx: center(p.caja).x - center(t.caja).x, dy: center(p.caja).y - center(t.caja).y } : { dx: null, dy: null };
    rows.push({ k: `${n.id}:${k}`, texto: ok, iou: io, ...d });
  }
  console.log(n.id, `${r.ms} ms`, "lines", r.leido.lineas.length, "/", n.verdad.lineas.length);
}
const withBox = rows.filter((r) => r.iou != null);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const summary = {
  campos: rows.length,
  texto_exacto: rows.filter((r) => r.texto).length,
  con_caja: withBox.length,
  iou_medio: Math.round(mean(withBox.map((r) => r.iou!)) * 1000) / 1000,
  iou_05: withBox.filter((r) => r.iou! >= 0.5).length,
  desvio_medio_x: Math.round(mean(withBox.map((r) => r.dx!)) * 10) / 10,
  desvio_medio_y: Math.round(mean(withBox.map((r) => r.dy!)) * 10) / 10,
};
console.log(JSON.stringify(summary));
for (const r of rows.filter((r) => !r.texto || (r.iou ?? 0) < 0.5)) console.log("  ", JSON.stringify(r));
