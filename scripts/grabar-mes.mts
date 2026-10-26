// Record "A month at Casa Nela": 12 fictional notes processed in date order with the real pipeline,
// each checked against the history built from the previous ones; plus the recorded intents of the
// sample questions so the sample works without the API.
// Usage: npx tsx --env-file=.env.local scripts/grabar-mes.mts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { analizarDocumento } from "../src/lib/documento";
import { normalize } from "../src/lib/albaran/normalize";
import { aritmeticaLinea, inferirIva } from "../src/lib/checks/engine";
import { toCents } from "../src/lib/numbers";
import { interpretar } from "../src/lib/intencion";
import { MES } from "../src/lib/demo/notas";
import type { Contexto } from "../src/lib/checks/types";
import type { Evento } from "../src/lib/pipeline";

const ctx: Contexto = { historial: [], registrados: [], pedidos: [] };
const eventos: { t: number; ev: Evento }[] = [];
const t0 = Date.now();
const emit = (ev: Evento) => eventos.push({ t: Date.now() - t0, ev });
let coste = 0;
const orden = [...MES].sort((a, b) => a.id.localeCompare(b.id));
for (const n of orden) {
  emit({ tipo: "etapa", etapa: "leer", estado: "inicio", docId: n.id });
  const res = await analizarDocumento(n.id, readFileSync(`public/muestras/mes/${n.id}.jpg`), ctx, { emitir: emit });
  coste += res.costeUsd;
  const a = inferirIva(normalize(n.id, res.leido));
  emit({ tipo: "albaran", docId: n.id, sello: res.sello, proveedor: a.proveedor, numero: a.numero, fecha: a.fecha, totalTexto: res.leido.total.texto });
  // What this note teaches the next ones.
  for (const l of a.lineas) {
    const r = aritmeticaLinea(l);
    const precio = r?.ok ? r.precio : l.precio?.candidates[0];
    if (precio != null && l.descripcion && a.proveedor && a.fecha) ctx.historial.push({ proveedor: a.proveedor, producto: l.descripcion, fecha: a.fecha, precioUnit: precio, unidad: l.unidad });
  }
  if (a.proveedor) ctx.registrados.push({ docId: n.id, proveedor: a.proveedor, numero: a.numero, fecha: a.fecha, totalCents: a.total ? toCents(a.total.candidates[0]) : null });
  console.log(n.id, res.sello, res.avisos.map((x) => `${x.codigo}:${x.centimos}`).join(" "), `${Math.round((res.ms.lectura + res.ms.segunda + res.ms.investigacion) / 1000)} s`);
}
emit({ tipo: "fin", ms: Date.now() - t0, costeUsd: Math.round(coste * 10000) / 10000 });

const lecturas = eventos.filter((e) => e.ev.tipo === "albaran").map((e) => e.ev as Extract<Evento, { tipo: "albaran" }>);
const proveedores = [...new Set(lecturas.map((x) => x.proveedor).filter((p): p is string => !!p))];
const productos = [...new Set(eventos.filter((e) => e.ev.tipo === "lectura").flatMap((e) => (e.ev as Extract<Evento, { tipo: "lectura" }>).leido.lineas.map((l) => l.descripcion.texto).filter((d): d is string => !!d)))];
const PREGUNTAS = [
  { es: "¿Cuánto he pagado de más este mes?", en: "How much have I overpaid this month?" },
  { es: "¿Qué ha subido de precio?", en: "What went up in price?" },
  { es: "¿Cuánto me ha cobrado Cárnicas del Nalón este mes?", en: "How much has Cárnicas del Nalón charged me this month?" },
  { es: "¿A cuánto me cobraron la ternera la última vez?", en: "What did the veal cost last time?" },
];
const preguntas = [];
for (const p of PREGUNTAS) {
  const { ms, ...consulta } = await interpretar(p.es, proveedores, productos);
  preguntas.push({ ...p, consulta, ms });
  console.log(p.es, "→", JSON.stringify(consulta));
}
mkdirSync("public/replays", { recursive: true });
writeFileSync("public/replays/mes.json", JSON.stringify({ id: "mes", grabado: new Date().toISOString(), modelo: "muse-spark-1.3", eventos, preguntas, proveedores, productos }));
console.log("recorded", eventos.length, "events,", `${Math.round((Date.now() - t0) / 1000)} s, $${coste.toFixed(3)}`);
