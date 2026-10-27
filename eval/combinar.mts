// Publish repeated runs of the same product version as one aggregate: the latest run's full table plus
// the mean and range over all runs (product spec §4.3: each configuration runs twice, mean and range
// are published, bad results too). Reads and writes numbers only.
// Usage: npx tsx eval/combinar.mts results/real-R-...-a.json results/real-R-...-b.json
// Writes results/real-R-latest.json, or results/real-R-latest-privado-<model>.json for private-mode runs.
import { readFileSync, writeFileSync } from "node:fs";

type R = { n: number; de: number; pct: number | null };
type Agg = { lineas_al_centimo: R; lineas_completas: R; albaranes_perfectos: R; ok_silencioso: number; revision_justificada: number; revision_innecesaria: number; config: { tag: string; modelo?: string; privado?: boolean }; fecha: string } & Record<string, unknown>;

const archivos = process.argv.slice(2);
if (archivos.length < 2) throw new Error("Give at least two result files of the same version.");
const runs = archivos.map((f) => JSON.parse(readFileSync(new URL(f, new URL("./", import.meta.url)), "utf8")) as Agg);
const ultimo = runs[runs.length - 1];
// Private-mode runs (an open model on our own hardware) combine into their own file, never into Muse Spark's.
const privados = runs.filter((r) => r.config.privado).length;
if (privados && privados !== runs.length) throw new Error("Do not mix private-mode and standard runs.");
if (privados && new Set(runs.map((r) => r.config.modelo)).size !== 1) throw new Error("Private runs of different models.");
const destino = privados ? `./results/real-R-latest-privado-${String(ultimo.config.modelo).replace(/[^a-z0-9.]+/gi, "-")}.json` : "./results/real-R-latest.json";
const pct = (n: number, de: number) => Math.round((1000 * n) / de) / 10;
const rango = (k: "lineas_al_centimo" | "lineas_completas" | "albaranes_perfectos") => {
  const n = runs.reduce((s, r) => s + r[k].n, 0), de = runs.reduce((s, r) => s + r[k].de, 0);
  const ps = runs.map((r) => r[k].pct ?? 0);
  return { n, de, pct: pct(n, de), min: Math.min(...ps), max: Math.max(...ps) };
};
const repeticiones = {
  pasadas: runs.length,
  lineas_al_centimo: rango("lineas_al_centimo"),
  lineas_completas: rango("lineas_completas"),
  albaranes_perfectos: rango("albaranes_perfectos"),
  perfectos: runs.map((r) => r.albaranes_perfectos.n),
  ok_silencioso: runs.map((r) => r.ok_silencioso),
  revision_justificada: runs.map((r) => r.revision_justificada),
  revision_innecesaria: runs.map((r) => r.revision_innecesaria),
};
const salida = { ...ultimo, repeticiones };
(function guard(v: unknown, path: string) {
  const permitidos = new Set(runs.flatMap((r) => [r.config.tag, r.fecha, ...Object.values(r.config).filter((x): x is string => typeof x === "string"), r.conjunto as string]));
  if (typeof v === "string" && !permitidos.has(v)) throw new Error(`aggregate would leak text at ${path}`);
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) guard(x, `${path}.${k}`);
})(salida, "salida");
writeFileSync(new URL(destino, import.meta.url), JSON.stringify(salida, null, 1));
console.log(JSON.stringify(repeticiones, null, 1));
