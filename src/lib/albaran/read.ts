import OpenAI from "openai";
import sharp from "sharp";
import { readerModel } from "../meta/models";
import { privateModeConfig, privateResponses, type ResponsesClient } from "../meta/privado";
import { ALBARAN_SCHEMA, READ_PROMPT, type AlbaranLeido } from "./schema";

export type Effort = "minimal" | "low" | "medium" | "high";

export interface ReadOptions {
  longSide?: number;
  effort?: Effort;
  client?: ResponsesClient;
}

export interface ReadResult {
  leido: AlbaranLeido;
  ms: number;
  usage: { input_tokens: number; output_tokens: number; reasoning_tokens: number };
  /** Size of the image actually sent; boxes refer to it. */
  width: number;
  height: number;
  /** The exact JPEG sent to the model (needed to crop cells for re-reading). Not serialised. */
  imagen?: Buffer;
}

let shared: OpenAI | null = null;
export function metaClient(): OpenAI {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("MODEL_API_KEY is not set");
  shared ??= new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey, maxRetries: 3, timeout: 90_000 });
  return shared;
}

let privado: ResponsesClient | null = null;
/**
 * Client for the text/vision calls (reading, second reading, investigator, question intent): the Meta API,
 * or the private endpoint when PRIVATE_MODEL_BASE_URL is set. SAM and voice always use metaClient().
 */
export function readerClient(): ResponsesClient {
  const cfg = privateModeConfig();
  if (!cfg) return metaClient();
  // One retry at most: a local model can take minutes per call, retrying three times would hide a dead server.
  privado ??= privateResponses(new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey, maxRetries: 1, timeout: cfg.timeoutMs }), { reasoningEffort: cfg.reasoningEffort });
  return privado;
}

/** Orient by EXIF, cap the long side, re-encode as JPEG. Returns the bytes sent to the model. */
export async function prepareImage(input: Buffer, longSide = 2048) {
  const jpeg = await sharp(input).rotate().resize({ width: longSide, height: longSide, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const { width = 0, height = 0 } = await sharp(jpeg).metadata();
  return { jpeg, width, height };
}

/** One call to Muse Spark: copy every printed field with its box. No arithmetic happens here. */
export async function readAlbaran(image: Buffer, opts: ReadOptions = {}): Promise<ReadResult> {
  const { longSide = 2048, effort = "low" } = opts;
  const client = opts.client ?? readerClient();
  const model = readerModel();
  const { jpeg, width, height } = await prepareImage(image, longSide);
  const t0 = Date.now();
  const r = await client.responses.create({
    model,
    reasoning: { effort },
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: READ_PROMPT },
          { type: "input_image", image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, detail: "auto" },
        ],
      },
    ],
    text: { format: { type: "json_schema", name: "albaran", schema: ALBARAN_SCHEMA as unknown as Record<string, unknown>, strict: true } },
  });
  const leido = JSON.parse(r.output_text) as AlbaranLeido;
  const u = r.usage;
  return {
    leido,
    ms: Date.now() - t0,
    usage: {
      input_tokens: u?.input_tokens ?? 0,
      output_tokens: u?.output_tokens ?? 0,
      reasoning_tokens: u?.output_tokens_details?.reasoning_tokens ?? 0,
    },
    width,
    height,
    imagen: jpeg,
  };
}

/** List price of Muse Spark 1.3 in USD per token (Oct 2026). */
export const PRICE = { input: 1.25e-6, output: 4.25e-6 };
/** API cost of a call: Spark's list price, or the private endpoint's (PRIVATE_MODEL_USD_PER_MTOK, 0 on own hardware). */
export const costUsd = (u: ReadResult["usage"]) => {
  const p = privateModeConfig()?.price ?? PRICE;
  return u.input_tokens * p.input + u.output_tokens * p.output;
};
