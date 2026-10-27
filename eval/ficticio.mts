// Whole pipeline on the fictional sample notes (true text and true row boxes known from the renderer).
// Safe for any hosted model: nothing here is real data. The real set is measured only by eval/real.mts, locally.
// Usage: npx tsx --env-file=.env.local eval/ficticio.mts [--effort low] [--tag name]
// Private mode (PRIVATE_MODEL_BASE_URL set): the tag carries "-privado-<model>"; Spark's file is never replaced.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { prepareImage, readAlbaran, costUsd, type Effort } from "../src/lib/albaran/read";
import { analizarDocumento } from "../src/lib/documento";
import { readerModel } from "../src/lib/meta/models";
import { privateModeConfig } from "../src/lib/meta/privado";
import type { AlbaranLeido, Caja } from "../src/lib/albaran/schema";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const effort = arg("effort", "low") as Effort;
const privado = privateModeConfig() != null;
const modelo = readerModel();
const tag = arg("tag", `${effort}-2048`) + (privado ? `-privado-${modelo.replace(/[^a-z0-9.]+/gi, "-")}` : "");
const CONC = Number(process.env.FICTICIO_CONCURRENCY || 4);
const sets = ["encimera", "girado", "mes"];
type Nota = { id: string; imagen: string; verdad: AlbaranLeido };
const notas = sets.flatMap((s) => (JSON.parse(readFileSync(`src/data/muestras/${s}.json`, "utf8")) as Nota[]).map((n) => ({ ...n, set: s })));
const only = arg("only", "");
if (only) for (let i = notas.length - 1; i >= 0; i--) if (!only.split(",").includes(notas[i].id)) notas.splice(i, 1);

const norm = (t: string | null | undefined) => (t ?? "").replace(/[^0-9,.\-]/g, "");
const iou = (a: Caja, b: Caja) => {
  const ix = Math.max(0, Math.min(a.x_max, b.x_max) - Math.max(a.x_min, b.x_min));
  const iy = Math.max(0, Math.min(a.y_max, b.y_max) - Math.max(a.y_min, b.y_min));
  const inter = ix * iy;
  return inter / ((a.x_max - a.x_min) * (a.y_max - a.y_min) + (b.x_max - b.x_min) * (b.y_max - b.y_min) - inter);
};
const enSuFila = (p: Caja, t: Caja) => { const cy = (p.y_min + p.y_max) / 2; return cy >= t.y_min && cy <= t.y_max; };
const sinPedidos = { historial: [], registrados: [], pedidos: [] };

async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const i = k++; out[i] = await f(items[i]); } }));
  return out;
}
const outDir = `.smoke/ficticio/${tag}`;
mkdirSync(outDir, { recursive: true });
console.log(`model=${modelo} private=${privado} tag=${tag} notes=${notas.length}`);

const rows = await pool(notas, CONC, async (n) => {
  const t0 = Date.now();
  try {
    const img = readFileSync(`public${n.imagen}`);
    const r = await readAlbaran(img, { effort });
    const { jpeg } = await prepareImage(img, 2048);
    const { width = 0, height = 0 } = await (await import("sharp")).default(jpeg).metadata();
    const res = await analizarDocumento(n.id, jpeg, sinPedidos, { effort, previa: { ...r, imagen: jpeg, width, height } });
    const ms = Date.now() - t0;
    const L = res.leido, V = n.verdad;
    let exact = 0;
    V.lineas.forEach((v, i) => { const l = L.lineas[i]; if (l && (["cantidad", "precio_unitario", "importe"] as const).every((k) => norm(l[k].texto) === norm(v[k].texto))) exact++; });
    let b = 0, bIou = 0, bFila = 0, bN = 0;
    V.lineas.forEach((v, i) => { const l = L.lineas[i]; if (!v.caja_fila) return; bN++; if (l?.caja_fila) { b++; bIou += iou(l.caja_fila, v.caja_fila); bFila += +enSuFila(l.caja_fila, v.caja_fila); } });
    const totalOk = norm(L.total.texto) === norm(V.total.texto);
    const completa = exact === V.lineas.length && L.lineas.length === V.lineas.length;
    const row = { id: n.id, ok: true as const, sello: res.sello, lineas: V.lineas.length, leidas: L.lineas.length, exact, totalOk, completa, bN, b, bIou, bFila, ms, usd: res.costeUsd + costUsd(r.usage), investigado: !!res.inv, veredicto: res.inv?.veredicto ?? null };
    writeFileSync(`${outDir}/${n.id}.json`, JSON.stringify({ ...row, leido: res.leido, avisos: res.avisos }, null, 1));
    console.log(n.id, res.sello, `lines ${exact}/${V.lineas.length} total ${totalOk} ${ms} ms`);
    return row;
  } catch (e) {
    console.log(n.id, "ERROR", String((e as Error).message).slice(0, 160));
    return { id: n.id, ok: false as const, error: String((e as Error).message).slice(0, 200) };
  }
});

const ok = rows.filter((r): r is Extract<typeof r, { ok: true }> => r.ok);
const sum = (f: (r: (typeof ok)[number]) => number) => ok.reduce((s, r) => s + f(r), 0);
const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
const summary = {
  modelo, privado, tag, notas: notas.length, notas_con_error: rows.length - ok.length,
  lineas_exactas: sum((r) => r.exact), lineas: sum((r) => r.lineas),
  totales_exactos: ok.filter((r) => r.totalOk).length,
  albaranes_perfectos: ok.filter((r) => r.completa && r.totalOk).length,
  ok_silenciosos: ok.filter((r) => r.sello === "CONFORME" && !(r.completa && r.totalOk)).length,
  revisiones_innecesarias: ok.filter((r) => r.sello === "REVISAR" && r.completa && r.totalOk).length,
  cajas_en_su_fila: sum((r) => r.bFila), cajas_total: sum((r) => r.bN), cajas_presentes: sum((r) => r.b),
  iou_medio: Math.round((sum((r) => r.bIou) / Math.max(1, sum((r) => r.b))) * 1000) / 1000,
  ms_mediana: ms[Math.floor(ms.length / 2)], ms_max: ms[ms.length - 1],
  usd_por_albaran: Math.round((sum((r) => r.usd) / Math.max(1, ok.length)) * 10000) / 10000,
};
console.log(JSON.stringify(summary));
for (const r of ok.filter((r) => !(r.completa && r.totalOk) || r.sello !== "CONFORME")) console.log("  check", r.id, r.sello, `${r.exact}/${r.lineas}`, `total ${r.totalOk}`);
mkdirSync("eval/results", { recursive: true });
writeFileSync(`eval/results/ficticio-${tag}.json`, JSON.stringify({ resumen: summary, notas: ok.map(({ id, sello, exact, lineas, totalOk, ms, usd }) => ({ id, sello, exact, lineas, totalOk, ms, usd })) }, null, 1));
