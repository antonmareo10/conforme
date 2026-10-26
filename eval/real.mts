// Accuracy on the real delivery notes of the family restaurant (set R), per product spec §4.
// Real images and per-note outputs stay outside the repo (REAL_EVAL_DIR). Only aggregate numbers
// are written to eval/results/, and the writer refuses anything that is not a metric or a tag.
//
// Usage: npx tsx --env-file=.env.local eval/real.mts [--effort low] [--side 2048] [--tag name] [--set R|S|I] [--only 01,02] [--rescore]
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readAlbaran, costUsd, prepareImage, type Effort } from "../src/lib/albaran/read";
import { investigar } from "../src/lib/agente/investigar";
import { normalize } from "../src/lib/albaran/normalize";
import { aritmeticaLinea, comprobar, importeLinea, inferirIva, sello, claveProducto } from "../src/lib/checks/engine";
import { normalizeNif } from "../src/lib/checks/nif";
import { toCents } from "../src/lib/numbers";
import type { Albaran, Linea } from "../src/lib/checks/types";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const DIR = process.env.REAL_EVAL_DIR ?? "C:/Users/anton/OneDrive/anton/competiciones/meta/datos-reales";
const effort = arg("effort", "low") as Effort;
const side = Number(arg("side", "2048"));
const set = arg("set", "R");
const tag = arg("tag", `${effort}-${side}`);
const resultTag = process.argv.includes("--investigar") ? `${tag}-investigar` : tag;
const only = arg("only", "");
const rescore = process.argv.includes("--rescore"); // recompute from saved readings, no API calls
const conInvestigacion = process.argv.includes("--investigar"); // run the investigator on notes with doubts
const CONCURRENCY = 6;

const SETS: Record<string, string[]> = {
  R: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "15", "16", "18", "19", "20", "21", "22", "23", "24", "25", "31", "32", "34", "35", "37", "38", "39", "40", "41", "42", "43"],
  S: ["13", "14", "17", "33", "36"],
  I: ["26", "27", "28", "29", "30"],
};
// Difficulty tags by note number (no names or contents).
const TAGS: Record<string, string[]> = {
  girado: ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24"],
  matricial_tenue: ["06", "21", "25", "34", "38"],
  borroso: ["12", "32"],
  dos_tipos_iva: ["35", "38", "39"],
};

interface Gt {
  proveedor: { nombre: string | null; nif: string | null };
  numero_albaran: string | null;
  fecha: string | null;
  lineas: { descripcion: string | null; cantidad: { valor: string } | null; precio_unitario: { valor: string } | null; importe_linea: { centimos: number } | null; iva_pct: number | null }[];
  total: { centimos: number } | null;
  dudoso: string[];
  ilegible: string[];
}

// ---------- matching ----------
const words = (s: string | null) => new Set(claveProducto(s).split(" ").filter(Boolean));
function sim(a: string | null, b: string | null): number {
  const A = words(a), B = words(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Optimal one-to-one assignment by DP over subsets (notes have at most ~15 lines). */
function assign(cost: number[][]): number[] {
  const n = cost.length, m = cost[0]?.length ?? 0;
  if (!n || !m) return new Array(n).fill(-1);
  if (m > 16) throw new Error("too many lines to match");
  const UNMATCHED = 1; // cost of leaving a predicted line unmatched
  const memo = new Map<string, { c: number; pick: number }>();
  const go = (i: number, used: number): number => {
    if (i === n) return 0;
    const key = `${i},${used}`;
    const hit = memo.get(key);
    if (hit) return hit.c;
    let best = UNMATCHED + go(i + 1, used), pick = -1;
    for (let j = 0; j < m; j++) {
      if (used & (1 << j)) continue;
      const c = cost[i][j] + go(i + 1, used | (1 << j));
      if (c < best) { best = c; pick = j; }
    }
    memo.set(key, { c: best, pick });
    return best;
  };
  go(0, 0);
  const out: number[] = [];
  let used = 0;
  for (let i = 0; i < n; i++) {
    const { pick } = memo.get(`${i},${used}`) ?? { pick: -1 };
    out.push(pick);
    if (pick >= 0) used |= 1 << pick;
  }
  return out;
}

function predCents(l: Linea) {
  return importeLinea(l);
}

function scoreDoc(a: Albaran, gt: Gt) {
  const pred = a.lineas;
  const cost = pred.map((p) =>
    gt.lineas.map((g) => {
      let c = 1 - sim(p.descripcion, g.descripcion);
      if (g.importe_linea && predCents(p) === g.importe_linea.centimos) c -= 0.5;
      return Math.max(0, c);
    }),
  );
  const match = assign(cost);
  const res = { lineasGt: gt.lineas.length, lineasPred: pred.length, conImporte: 0, alCentimo: 0, completas: 0, completasDen: 0, descripcionOk: 0, perdidas: 0, sobrantes: 0 };
  const matchedGt = new Set<number>();
  match.forEach((j, i) => {
    if (j < 0) { res.sobrantes++; return; }
    matchedGt.add(j);
    const p = pred[i], g = gt.lineas[j];
    const r = aritmeticaLinea(p);
    const q = r?.ok ? r.cantidad : p.cantidad?.candidates[0] ?? null;
    const pr = r?.ok ? r.precio : p.precio?.candidates[0] ?? null;
    const imp = predCents(p);
    if (g.importe_linea) {
      res.conImporte++;
      if (imp === g.importe_linea.centimos) res.alCentimo++;
    }
    let complete = true;
    if (g.cantidad && (q == null || Math.abs(q - Number(g.cantidad.valor)) > 1e-9)) complete = false;
    if (g.precio_unitario && (pr == null || Math.abs(pr - Number(g.precio_unitario.valor)) > 1e-9)) complete = false;
    if (g.importe_linea && imp !== g.importe_linea.centimos) complete = false;
    if (g.iva_pct != null && p.ivaPct !== g.iva_pct) complete = false;
    res.completasDen++;
    if (complete) res.completas++;
    if (sim(p.descripcion, g.descripcion) >= 0.9) res.descripcionOk++;
  });
  gt.lineas.forEach((g, j) => {
    if (!matchedGt.has(j)) {
      res.perdidas++;
      if (g.importe_linea) res.conImporte++;
    }
  });
  const header = {
    proveedor: gt.proveedor.nif || gt.proveedor.nombre ? Number((a.nif && gt.proveedor.nif && normalizeNif(a.nif) === normalizeNif(gt.proveedor.nif)) || sim(a.proveedor, gt.proveedor.nombre) >= 0.85) : null,
    numero: gt.numero_albaran ? Number((a.numero ?? "").replace(/\s/g, "") === gt.numero_albaran.replace(/\s/g, "")) : null,
    fecha: gt.fecha ? Number(a.fecha === gt.fecha) : null,
    total: gt.total ? Number(a.total != null && toCents(a.total.candidates[0]) === gt.total.centimos) : null,
  };
  const todasAlCentimo = res.alCentimo === res.conImporte && res.perdidas === 0;
  const totalOk = header.total !== 0;
  const perfecto = res.completas === res.completasDen && res.sobrantes === 0 && res.perdidas === 0 && totalOk;
  return { ...res, header, todasAlCentimo, totalOk, perfecto };
}

// ---------- run ----------
async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let k = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (k < items.length) { const i = k++; out[i] = await f(items[i]); }
  }));
  return out;
}

const files = readdirSync(join(DIR, "gt")).filter((f) => f.endsWith(".json"));
const ids = (only ? only.split(",") : SETS[set]).map((id) => {
  const f = files.find((x) => x.startsWith(`${id}_`));
  if (!f) throw new Error(`no ground truth for ${id}`);
  return { id, base: f.replace(/\.json$/, "") };
});

const outDir = join(DIR, "salidas", tag);
mkdirSync(outDir, { recursive: true });
const sinPedidos = { historial: [], registrados: [], pedidos: [] };

const rows = await pool(ids, CONCURRENCY, async ({ id, base }) => {
  const gt = JSON.parse(readFileSync(join(DIR, "gt", `${base}.json`), "utf8")) as Gt;
  const img = readFileSync(join(DIR, "img", `${base}.jpg`));
  try {
    const saved = join(outDir, `${id}.json`);
    const r = rescore && existsSync(saved) ? JSON.parse(readFileSync(saved, "utf8")) : await readAlbaran(img, { effort, longSide: side });
    let a = inferirIva(normalize(id, r.leido));
    let avisos = comprobar(a, sinPedidos);
    let st = sello(avisos);
    let inv: { veredicto: string | null; valido: boolean; pasos: number; usd: number } | null = null;
    if (conInvestigacion && st === "REVISAR") {
      const imagen = r.imagen ?? (await prepareImage(img, side)).jpeg;
      const x = await investigar(id, r.leido, imagen, sinPedidos, { effort });
      a = x.albaran;
      avisos = x.avisos;
      st = x.sello;
      inv = { veredicto: x.veredicto, valido: x.valido, pasos: x.pasos.length, usd: costUsd({ ...x.usage, reasoning_tokens: 0 }) };
    }
    const s = scoreDoc(a, gt);
    if (!rescore || !conInvestigacion) writeFileSync(join(outDir, `${id}.json`), JSON.stringify({ leido: r.leido, avisos, sello: st, score: s, ms: r.ms, usage: r.usage }, null, 1));
    const row = { id, ok: true as const, sello: st, codigos: avisos.map((x) => x.codigo), ms: r.ms, usd: costUsd(r.usage) + (inv?.usd ?? 0), inv, ...s };
    process.stdout.write(`${id} ${st.padEnd(12)} lines ${s.alCentimo}/${s.conImporte} at cent, total ${s.header.total}, ${r.ms} ms\n`);
    return row;
  } catch (e) {
    process.stdout.write(`${id} ERROR ${String((e as Error).message).slice(0, 160)}\n`);
    return { id, ok: false as const, error: String((e as Error).message).slice(0, 200) };
  }
});

// ---------- aggregate (numbers and tags only) ----------
type Row = Extract<(typeof rows)[number], { ok: true }>;
const ok = rows.filter((r): r is Row => r.ok);
const sum = (f: (r: Row) => number, rs: Row[] = ok) => rs.reduce((s, r) => s + f(r), 0);
const ratio = (a: number, b: number) => ({ n: a, de: b, pct: b ? Math.round((1000 * a) / b) / 10 : null });
const pctl = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const hdr = (k: "proveedor" | "numero" | "fecha" | "total") => ratio(sum((r) => r.header[k] ?? 0), ok.filter((r) => r.header[k] != null).length);

function metrics(rs: Row[]) {
  return {
    albaranes: rs.length,
    lineas_al_centimo: ratio(sum((r) => r.alCentimo, rs), sum((r) => r.conImporte, rs)),
    lineas_completas: ratio(sum((r) => r.completas, rs), sum((r) => r.lineasGt, rs)),
    albaranes_perfectos: ratio(rs.filter((r) => r.perfecto).length, rs.length),
    ok_silencioso: rs.filter((r) => r.sello === "CONFORME" && (!r.todasAlCentimo || !r.totalOk)).length,
  };
}

const aggregate = {
  conjunto: set,
  config: { modelo: "muse-spark-1.3", effort, lado_px: side, tag },
  fecha: new Date().toISOString().slice(0, 10),
  procesados: ratio(ok.length, rows.length),
  ...metrics(ok),
  descripcion: ratio(sum((r) => r.descripcionOk), sum((r) => r.lineasGt)),
  lineas_perdidas: sum((r) => r.perdidas),
  lineas_sobrantes: sum((r) => r.sobrantes),
  cabecera: { proveedor: hdr("proveedor"), numero: hdr("numero"), fecha: hdr("fecha"), total: hdr("total") },
  sellos: { CONFORME: ok.filter((r) => r.sello === "CONFORME").length, CON_RESERVAS: ok.filter((r) => r.sello === "CON_RESERVAS").length, REVISAR: ok.filter((r) => r.sello === "REVISAR").length },
  // Spec §4.2: a review is justified when the note was not read entirely right.
  revision_justificada: ok.filter((r) => r.sello === "REVISAR" && !r.perfecto).length,
  revision_innecesaria: ok.filter((r) => r.sello !== "CONFORME" && r.perfecto).length,
  // Softer than a silent OK: stamped CONFORME, every euro right, but some quantity/price/rate misread.
  conforme_no_perfecto: ok.filter((r) => r.sello === "CONFORME" && !r.perfecto).length,
  por_dificultad: Object.fromEntries(Object.entries(TAGS).map(([t, list]) => [t, metrics(ok.filter((r) => list.includes(r.id)))])),
  investigacion: conInvestigacion
    ? {
        investigados: ok.filter((r) => r.inv).length,
        reparadas: ok.filter((r) => r.inv?.veredicto === "celda_mal_leida" && r.inv.valido).length,
        confirmadas: ok.filter((r) => r.inv?.veredicto === "lectura_confirmada" && r.inv.valido).length,
        errores_proveedor: ok.filter((r) => r.inv?.veredicto === "error_proveedor" && r.inv.valido).length,
        siguen_en_revisar: ok.filter((r) => r.inv && r.sello === "REVISAR").length,
        cierres_rechazados_por_el_codigo: ok.filter((r) => r.inv && !r.inv.valido).length,
        pasos_medios: Math.round((sum((r) => r.inv?.pasos ?? 0) / Math.max(1, ok.filter((r) => r.inv).length)) * 10) / 10,
      }
    : null,
  tiempo_ms: { p50: pctl(ok.map((r) => r.ms), 0.5), p95: pctl(ok.map((r) => r.ms), 0.95) },
  coste_usd: { total: Math.round(sum((r) => r.usd) * 1000) / 1000, por_albaran: ok.length ? Math.round((sum((r) => r.usd) / ok.length) * 10000) / 10000 : null },
};

// Refuse to write anything but metric names, tags and numbers.
const ALLOWED_STRING_VALUES = new Set([set, "muse-spark-1.3", effort, tag, aggregate.fecha]);
(function guard(v: unknown, path: string) {
  if (typeof v === "string" && !ALLOWED_STRING_VALUES.has(v)) throw new Error(`aggregate would leak text at ${path}`);
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) guard(x, `${path}.${k}`);
})(aggregate, "aggregate");

const resultsDir = new URL("./results/", import.meta.url);
if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });
const outFile = new URL(`./results/real-${set}-${aggregate.fecha}-${resultTag}.json`, import.meta.url);
writeFileSync(outFile, JSON.stringify(aggregate, null, 1));
console.log(JSON.stringify({ ...aggregate, por_dificultad: undefined }, null, 1));
console.log("wrote", outFile.pathname);
