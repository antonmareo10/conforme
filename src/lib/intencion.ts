// Speech → text (Muse Voice Transcribe) and text → intent (Muse Spark, strict schema). Suppliers and
// products are enums built from the session's own notes, so the model cannot invent an entity.
import { assertAllowedModel, MODELS, readerModel } from "./meta/models";
import type { ResponsesClient } from "./meta/privado";
import { readerClient } from "./albaran/read";
import { INTENCIONES, PERIODOS, type Consulta } from "./preguntas";

export async function transcribir(wav: Blob): Promise<{ texto: string; ms: number }> {
  assertAllowedModel(MODELS.transcribe);
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("MODEL_API_KEY is not set");
  const fd = new FormData();
  fd.append("request", new Blob([JSON.stringify({ model: MODELS.transcribe, audioEncoding: "WAV", mode: "PUSH_TO_TALK" })], { type: "application/json" }));
  fd.append("audio", wav, "pregunta.wav");
  const t0 = Date.now();
  const r = await fetch("https://api.meta.ai/v1/asr/transcribe", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, body: fd });
  if (!r.ok) throw new Error(`transcribe ${r.status}`);
  const j = (await r.json()) as { transcript?: string };
  return { texto: (j.transcript ?? "").trim(), ms: Date.now() - t0 };
}

const PROMPT = `You turn a restaurant owner's question about their supplier delivery notes into a query. Spanish or English.
Intents:
- PAGADO_DE_MAS: how much they overpaid (price rises, supplier errors, duplicates).
- SUBIDAS: what went up in price.
- GASTO_PROVEEDOR: how much a supplier charged.
- GASTO_PRODUCTO: how much was spent on a product.
- ULTIMO_PRECIO: what a product cost last time.
- AVISOS: which notes have problems.
- IVA: how much VAT.
- DESCONOCIDA: anything else.
Periods: hoy (today), esta_semana, este_mes (this month), mes_pasado (last month), todo (all / unspecified).
Use null for proveedor/producto when the question does not name one. Pick them only from the allowed lists.`;

export async function interpretar(texto: string, proveedores: string[], productos: string[], client?: ResponsesClient): Promise<Consulta & { ms: number }> {
  const model = readerModel();
  const c = client ?? readerClient();
  const t0 = Date.now();
  const enumOrNull = (vals: string[]) => (vals.length ? { anyOf: [{ type: "string", enum: vals }, { type: "null" }] } : { type: "null" });
  const r = await c.responses.create({
    model,
    reasoning: { effort: "minimal" },
    input: [{ role: "developer", content: PROMPT }, { role: "user", content: texto.slice(0, 500) }],
    text: {
      format: {
        type: "json_schema",
        name: "consulta",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["intencion", "proveedor", "producto", "periodo"],
          properties: {
            intencion: { type: "string", enum: [...INTENCIONES] },
            proveedor: enumOrNull([...new Set(proveedores)].slice(0, 200)),
            producto: enumOrNull([...new Set(productos)].slice(0, 400)),
            periodo: { type: "string", enum: [...PERIODOS] },
          },
        },
      },
    },
  });
  const out = JSON.parse(r.output_text) as Consulta;
  return { ...out, ms: Date.now() - t0 };
}
