// Day-0 smoke test: function calling with the Responses API on muse-spark-1.3.
import { readFileSync } from "node:fs";
import OpenAI from "openai";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: env.MODEL_API_KEY });
const tools = [
  { type: "function", name: "releer_celda", description: "Crop the cell of a line on the paper, zoom 2x and read it again.", strict: true,
    parameters: { type: "object", additionalProperties: false, required: ["linea", "campo"], properties: { linea: { type: "integer" }, campo: { type: "string", enum: ["cantidad", "precio_unitario", "importe"] } } } },
  { type: "function", name: "cerrar", description: "Close the investigation with a verdict.", strict: true,
    parameters: { type: "object", additionalProperties: false, required: ["veredicto", "evidencias"], properties: { veredicto: { type: "string", enum: ["error_proveedor", "celda_mal_leida", "revisar"] }, evidencias: { type: "array", items: { type: "string" } } } } },
];
const input = [{ role: "user", content: "Line 2 of a delivery note reads: quantity 24, unit price 0,950, amount 28,20. 24 x 0,95 = 22,80, so it does not add up. Investigate with the tools, one step at a time." }];
let t0 = Date.now();
let r = await client.responses.create({ model: "muse-spark-1.3", reasoning: { effort: "low" }, tools, input });
console.log("1st", Date.now() - t0, "ms", JSON.stringify(r.output.map((o) => ({ type: o.type, name: o.name, args: o.arguments, call_id: o.call_id }))));
const call = r.output.find((o) => o.type === "function_call");
if (call) {
  input.push(...r.output.filter((o) => o.type !== "reasoning" || true));
  input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ evidenciaId: "ev1", texto: "28,20", nota: "zoomed crop confirms the printed amount is 28,20" }) });
  t0 = Date.now();
  r = await client.responses.create({ model: "muse-spark-1.3", reasoning: { effort: "low" }, tools, input });
  console.log("2nd", Date.now() - t0, "ms", JSON.stringify(r.output.map((o) => ({ type: o.type, name: o.name, args: o.arguments }))), r.output_text?.slice(0, 200));
}
