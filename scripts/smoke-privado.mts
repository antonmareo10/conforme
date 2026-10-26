// Private-mode smoke test: one reading of a fictional sample note and one short tool round trip, through
// the chat-completions adapter, against whatever PRIVATE_MODEL_BASE_URL points at (llama-server, Baseten…).
//
//   PRIVATE_MODEL_BASE_URL=http://127.0.0.1:8080/v1 npx tsx scripts/smoke-privado.mts
//   (adapter check against Meta's own chat completions: PRIVATE_MODEL_BASE_URL=https://api.meta.ai/v1
//    PRIVATE_MODEL=muse-spark-1.3, run with --env-file=.env.local and --meta-key)
import { readFileSync } from "node:fs";
import type { FunctionTool, ResponseFunctionToolCall, ResponseInputItem } from "openai/resources/responses/responses";
import { costUsd, readAlbaran, readerClient, type Effort } from "../src/lib/albaran/read";
import { readerModel } from "../src/lib/meta/models";
import { privateModeConfig } from "../src/lib/meta/privado";
import muestras from "../src/data/muestras/encimera.json";

const cfg0 = privateModeConfig();
if (!cfg0) throw new Error("Set PRIVATE_MODEL_BASE_URL (e.g. http://127.0.0.1:8080/v1) to run the private-mode smoke test.");
if (process.argv.includes("--meta-key")) {
  // Only for checking the adapter against Meta's own endpoint: the Meta key never goes anywhere else.
  if (new URL(cfg0.baseURL).hostname !== "api.meta.ai") throw new Error("--meta-key is only allowed with https://api.meta.ai/v1");
  if (!process.env.MODEL_API_KEY) throw new Error("MODEL_API_KEY is not set");
  process.env.PRIVATE_MODEL_API_KEY = process.env.MODEL_API_KEY;
}
const effortArg = process.argv.indexOf("--effort");
const effort = (effortArg > 0 ? process.argv[effortArg + 1] : "low") as Effort;
const model = readerModel();
console.log(`private mode: ${cfg0.baseURL} model=${model} reasoning_effort=${cfg0.reasoningEffort} (${effort})`);

// 1. One reading of a fictional note, strict JSON schema, image inline.
const muestra = muestras.find((m) => m.id === "bebidas-77120")!;
const r = await readAlbaran(readFileSync(`public${muestra.imagen}`), { effort });
const verdad = muestra.verdad.lineas;
console.log(`\nreading: parsed OK in ${r.ms} ms, ${r.usage.input_tokens} in / ${r.usage.output_tokens} out (${r.usage.reasoning_tokens} reasoning), $${costUsd(r.usage).toFixed(4)}`);
console.log(`proveedor=${r.leido.proveedor.texto} numero=${r.leido.numero.texto} fecha=${r.leido.fecha.texto} total=${r.leido.total.texto} (truth ${muestra.verdad.total.texto})`);
let iguales = 0;
r.leido.lineas.forEach((l, i) => {
  const v = verdad[i];
  const igual = !!v && (["cantidad", "precio_unitario", "importe"] as const).every((k) => l[k].texto === v[k].texto);
  if (igual) iguales++;
  console.log(`  ${igual ? "=" : "≠"} ${l.descripcion.texto} | ${l.cantidad.texto} ${l.unidad ?? ""} x ${l.precio_unitario.texto} = ${l.importe.texto} | IVA ${l.iva_pct.texto} | box ${l.caja_fila ? "yes" : "no"}`);
});
console.log(`  lines: ${r.leido.lineas.length} read, ${verdad.length} printed, ${iguales} with quantity, price and amount exactly as printed`);

// 2. A short tool round trip, replayed exactly like the investigator does.
const tools: FunctionTool[] = [{
  type: "function", name: "historial_precio", description: "Last purchase price of a product (code lookup).", strict: true,
  parameters: { type: "object", additionalProperties: false, required: ["producto"], properties: { producto: { type: "string" } } },
}];
const input: ResponseInputItem[] = [
  { role: "developer", content: "You answer questions about a restaurant's purchases. Use the tool for prices; never guess a number." },
  { role: "user", content: "¿A cuánto pagamos el AGUA MINERAL 50 CL la última vez? Responde en una frase." },
];
const client = readerClient();
for (let ronda = 1; ronda <= 3; ronda++) {
  const t0 = Date.now();
  const res = await client.responses.create({ model, reasoning: { effort }, tools, input });
  const calls = res.output.filter((o): o is ResponseFunctionToolCall => o.type === "function_call");
  console.log(`\ntools round ${ronda}: ${Date.now() - t0} ms, ${res.usage?.input_tokens ?? 0} in / ${res.usage?.output_tokens ?? 0} out, calls=${JSON.stringify(calls.map((c) => [c.name, c.arguments]))}`);
  input.push(...(res.output as ResponseInputItem[]));
  if (!calls.length) {
    console.log(`final answer: ${res.output_text}`);
    break;
  }
  for (const c of calls) input.push({ type: "function_call_output", call_id: c.call_id, output: JSON.stringify({ fecha: "2026-09-29", precio: "0,350", unidad: "ud" }) });
}
