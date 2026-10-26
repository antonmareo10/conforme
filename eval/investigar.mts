// Try the investigator on fictional samples (read + investigate) and on saved real readings.
// Usage: npx tsx --env-file=.env.local eval/investigar.mts encimera            (fictional set)
//        npx tsx --env-file=.env.local eval/investigar.mts real 34,38 [tag]     (real notes; private output)
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readAlbaran, prepareImage, costUsd } from "../src/lib/albaran/read";
import { investigar } from "../src/lib/agente/investigar";
import { ENCIMERA_CONTEXTO } from "../src/lib/demo/notas";
import type { AlbaranLeido } from "../src/lib/albaran/schema";
import type { Contexto } from "../src/lib/checks/types";

const [modo = "encimera", ids = "", tag = "low-2048"] = process.argv.slice(2);
const vacio: Contexto = { historial: [], registrados: [], pedidos: [] };
const DIR = process.env.REAL_EVAL_DIR ?? "";
if (modo === "real" && !DIR) throw new Error("Set REAL_EVAL_DIR to the private folder with gt/ and img/ (never inside this repo).");

async function caso(nombre: string, leido: AlbaranLeido, imagen: Buffer, ctx: Contexto, privado: boolean) {
  const inv = await investigar(nombre, leido, imagen, ctx);
  console.log(`\n${nombre}: investigado=${inv.investigado} veredicto=${inv.veredicto} valido=${inv.valido}${inv.motivo ? ` (${inv.motivo})` : ""} sello=${inv.sello} ${inv.ms} ms $${costUsd({ ...inv.usage, reasoning_tokens: 0 }).toFixed(4)}`);
  for (const p of inv.pasos) console.log(`  ${p.n}. ${p.herramienta} ${JSON.stringify(p.args)} -> ${privado ? (p.evidenciaId ?? "") : p.resumen.slice(0, 160)} (${p.ms} ms)`);
  console.log("  avisos:", inv.avisos.map((a) => `${a.codigo}${a.lineaIdx != null ? "@" + (a.lineaIdx + 1) : ""}:${a.centimos}`).join(" "));
  if (inv.explicacion && !privado) console.log("  explicación:", inv.explicacion);
  return inv;
}

if (modo === "real") {
  const out = join(DIR, "salidas", `${tag}-investigar`);
  mkdirSync(out, { recursive: true });
  const files = readdirSync(join(DIR, "gt"));
  for (const id of ids.split(",")) {
    const base = files.find((f) => f.startsWith(`${id}_`))!.replace(/\.json$/, "");
    const saved = JSON.parse(readFileSync(join(DIR, "salidas", tag, `${id}.json`), "utf8"));
    const { jpeg } = await prepareImage(readFileSync(join(DIR, "img", `${base}.jpg`)), 2048);
    const inv = await caso(id, saved.leido, jpeg, vacio, true);
    writeFileSync(join(out, `${id}.json`), JSON.stringify({ ...inv, evidencias: inv.evidencias.map((e) => ({ ...e, miniatura: undefined })) }, null, 1));
  }
} else {
  const notas = JSON.parse(readFileSync(`src/data/muestras/${modo}.json`, "utf8")) as { id: string; imagen: string }[];
  for (const n of notas) {
    const r = await readAlbaran(readFileSync(`public${n.imagen}`));
    await caso(n.id, r.leido, r.imagen!, ENCIMERA_CONTEXTO, false);
  }
}
