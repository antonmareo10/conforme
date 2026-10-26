// Private mode: the same reading, run on an open-weight Meta model (Muse Glimmer on llama.cpp, Muse Spark
// Open on Baseten, ...) behind an OpenAI-compatible /chat/completions endpoint. Conforme's code speaks the
// Responses API; this adapter translates exactly the subset it uses (messages with text and images, strict
// JSON schemas, reasoning effort, function tools and the agent loop's replayed items) and throws on anything
// else instead of silently dropping it. SAM and voice never come here: they stay on the Meta API.
import type {
  ChatCompletion,
  ChatCompletionContentPart,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";
import type { CompletionUsage } from "openai/resources/completions";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseInputItem,
  ResponseInputMessageContentList,
  ResponseOutputItem,
  ResponseUsage,
  Tool,
} from "openai/resources/responses/responses";
import type { ReasoningEffort } from "openai/resources/shared";
import { readerModel, type Env } from "./models";

/** What Conforme reads from a Responses API result. */
export type ResponsesResult = Pick<Response, "id" | "model" | "status" | "incomplete_details" | "output" | "output_text" | "usage">;

/** The subset of the OpenAI client the reading code needs. An `OpenAI` instance satisfies it, and so does the adapter. */
export interface ResponsesClient {
  responses: { create(body: ResponseCreateParamsNonStreaming): Promise<ResponsesResult> };
}

/** The subset of an OpenAI-compatible chat client the adapter needs. */
export interface ChatClient {
  chat: { completions: { create(body: ChatCompletionCreateParamsNonStreaming): Promise<Pick<ChatCompletion, "id" | "model" | "choices" | "usage">> } };
}

/** "pass" forwards the caller's effort as `reasoning_effort`; "omit" never sends it (some servers reject it); a value overrides it. */
export type ReasoningEffortMode = "pass" | "omit" | Exclude<ReasoningEffort, null>;

export interface PrivateAdapterOptions {
  reasoningEffort?: ReasoningEffortMode;
}

export class PrivateModeError extends Error {
  constructor(message: string) {
    super(`private mode: ${message}`);
    this.name = "PrivateModeError";
  }
}

type InputContent = string | ResponseInputMessageContentList;
type AssistantTurn = { text: string[]; calls: ChatCompletionMessageFunctionToolCall[] };

function textOnly(content: InputContent, role: string): string {
  if (typeof content === "string") return content;
  return content
    .map((p) => {
      if (p.type !== "input_text") throw new PrivateModeError(`a ${role} message can only carry text (got ${p.type})`);
      return p.text;
    })
    .join("\n");
}

function userContent(content: InputContent): string | ChatCompletionContentPart[] {
  if (typeof content === "string") return content;
  return content.map((p): ChatCompletionContentPart => {
    if (p.type === "input_text") return { type: "text", text: p.text };
    if (p.type === "input_image") {
      if (!p.image_url) throw new PrivateModeError("images must be sent inline as image_url (file_id is not supported)");
      return { type: "image_url", image_url: { url: p.image_url, detail: p.detail } };
    }
    throw new PrivateModeError(`input content "${p.type}" is not supported`);
  });
}

/** Text of an assistant turn replayed into the input (an output message, or an easy message with role assistant). */
function assistantText(content: string | ReadonlyArray<{ type: string; text?: string; refusal?: string }>): string {
  if (typeof content === "string") return content;
  return content.map((p) => p.text ?? p.refusal ?? "").join("");
}

/** Responses input items → chat messages. Consecutive assistant items (text and function calls of one turn) become one assistant message. */
export function toChatMessages(body: Pick<ResponseCreateParamsNonStreaming, "input" | "instructions">): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  if (body.instructions) out.push({ role: "system", content: body.instructions });
  const items: ResponseInputItem[] = typeof body.input === "string" ? [{ role: "user", content: body.input }] : (body.input ?? []);
  let turn: AssistantTurn | null = null;
  const assistant = (): AssistantTurn => (turn ??= { text: [], calls: [] });
  const flush = () => {
    if (!turn) return;
    const text = turn.text.join("");
    out.push({ role: "assistant", content: text || null, ...(turn.calls.length ? { tool_calls: turn.calls } : {}) });
    turn = null;
  };

  for (const item of items) {
    if (item.type === "reasoning") continue; // the model's own reasoning is not replayed over chat completions
    if (item.type === "function_call") {
      assistant().calls.push({ id: item.call_id, type: "function", function: { name: item.name, arguments: item.arguments } });
      continue;
    }
    if (item.type === "function_call_output") {
      if (!item.call_id) throw new PrivateModeError("function_call_output needs a call_id");
      flush();
      const content = typeof item.output === "string" ? item.output : item.output.map((p) => {
        if (p.type !== "input_text") throw new PrivateModeError(`tool outputs can only carry text (got ${p.type})`);
        return p.text;
      }).join("\n");
      out.push({ role: "tool", tool_call_id: item.call_id, content });
      continue;
    }
    if ("role" in item && (item.type === undefined || item.type === "message")) {
      if (item.role === "assistant") {
        assistant().text.push(assistantText(item.content));
        continue;
      }
      if (item.role === "user" || item.role === "system" || item.role === "developer") {
        flush();
        // Open-model chat templates know "system"; "developer" is the Responses name for the same turn.
        out.push(item.role === "user" ? { role: "user", content: userContent(item.content) } : { role: "system", content: textOnly(item.content, item.role) });
        continue;
      }
    }
    throw new PrivateModeError(`input item "${item.type ?? "message"}" is not supported`);
  }
  flush();
  return out;
}

function toChatTool(t: Tool): ChatCompletionTool {
  if (t.type !== "function") throw new PrivateModeError(`only function tools are supported (got ${t.type})`);
  return {
    type: "function",
    function: {
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
      ...(t.parameters ? { parameters: t.parameters } : {}),
      ...(t.strict != null ? { strict: t.strict } : {}),
    },
  };
}

function toChatToolChoice(c: NonNullable<ResponseCreateParamsNonStreaming["tool_choice"]>): ChatCompletionToolChoiceOption {
  if (c === "auto" || c === "none" || c === "required") return c;
  if (c.type === "function" && "name" in c) return { type: "function", function: { name: c.name } };
  throw new PrivateModeError(`tool_choice "${c.type}" is not supported`);
}

const UNSUPPORTED = ["previous_response_id", "conversation", "background", "prompt", "stream"] as const;

/** Responses request → chat completions request. */
export function toChatRequest(body: ResponseCreateParamsNonStreaming, opts: PrivateAdapterOptions = {}): ChatCompletionCreateParamsNonStreaming {
  for (const k of UNSUPPORTED) if (body[k]) throw new PrivateModeError(`"${k}" is not supported`);
  if (!body.model) throw new PrivateModeError("model is required");
  const req: ChatCompletionCreateParamsNonStreaming = { model: body.model, messages: toChatMessages(body) };

  const mode = opts.reasoningEffort ?? "pass";
  const effort = mode === "pass" ? body.reasoning?.effort : mode === "omit" ? null : mode;
  if (effort) req.reasoning_effort = effort;

  const format = body.text?.format;
  if (format?.type === "json_schema") {
    req.response_format = {
      type: "json_schema",
      json_schema: { name: format.name, schema: format.schema, ...(format.strict != null ? { strict: format.strict } : {}), ...(format.description ? { description: format.description } : {}) },
    };
  } else if (format?.type === "json_object") {
    req.response_format = { type: "json_object" };
  }

  if (body.tools?.length) req.tools = body.tools.map(toChatTool);
  if (body.tool_choice) req.tool_choice = toChatToolChoice(body.tool_choice);
  if (body.parallel_tool_calls != null) req.parallel_tool_calls = body.parallel_tool_calls;
  if (body.max_output_tokens != null) req.max_tokens = body.max_output_tokens;
  if (body.temperature != null) req.temperature = body.temperature;
  if (body.top_p != null) req.top_p = body.top_p;
  return req;
}

/**
 * JSON the caller asked for, without the wrappers some open models put around it: a leading
 * <think>…</think> block the server did not split off, or a ```json fence. Valid JSON passes unchanged.
 */
export function extractJson(text: string): string {
  const s = text.replace(/^\s*<think>[\s\S]*?<\/think>/, "").trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1] : s;
}

function toUsage(u: CompletionUsage | null | undefined): ResponseUsage | undefined {
  if (!u) return undefined;
  return {
    input_tokens: u.prompt_tokens,
    input_tokens_details: { cached_tokens: u.prompt_tokens_details?.cached_tokens ?? 0, cache_write_tokens: 0 },
    output_tokens: u.completion_tokens,
    output_tokens_details: { reasoning_tokens: u.completion_tokens_details?.reasoning_tokens ?? 0 },
    total_tokens: u.total_tokens ?? u.prompt_tokens + u.completion_tokens,
  };
}

/** Chat completion → the Responses result fields Conforme reads. */
export function fromChatCompletion(c: Pick<ChatCompletion, "id" | "model" | "choices" | "usage">, wantsJson: boolean): ResponsesResult {
  const choice = c.choices[0];
  if (!choice) throw new PrivateModeError("the endpoint returned no choices");
  const m = choice.message;
  const incomplete = choice.finish_reason === "length" ? "max_output_tokens" : choice.finish_reason === "content_filter" ? "content_filter" : null;
  const status = incomplete ? "incomplete" : "completed";
  const text = wantsJson ? extractJson(m.content ?? "") : (m.content ?? "");

  const output: ResponseOutputItem[] = [];
  if (text || m.refusal) {
    output.push({
      id: `msg_${c.id}`,
      type: "message",
      role: "assistant",
      status,
      content: [...(text ? [{ type: "output_text" as const, text, annotations: [] }] : []), ...(m.refusal ? [{ type: "refusal" as const, refusal: m.refusal }] : [])],
    });
  }
  (m.tool_calls ?? []).forEach((tc, i) => {
    if (tc.type !== "function") throw new PrivateModeError(`tool call type "${tc.type}" is not supported`);
    const callId = tc.id || `call_${c.id}_${i}`;
    output.push({ type: "function_call", id: `fc_${callId}`, call_id: callId, name: tc.function.name, arguments: tc.function.arguments || "{}", status: "completed" });
  });

  return { id: c.id, model: c.model, status, incomplete_details: incomplete ? { reason: incomplete } : null, output, output_text: text, usage: toUsage(c.usage) };
}

/** A Responses-shaped client over any OpenAI-compatible chat completions endpoint. */
export function privateResponses(chat: ChatClient, opts: PrivateAdapterOptions = {}): ResponsesClient {
  return {
    responses: {
      async create(body) {
        const req = toChatRequest(body, opts);
        const res = await chat.chat.completions.create(req);
        return fromChatCompletion(res, !!req.response_format && req.response_format.type !== "text");
      },
    },
  };
}

export interface PrivateModeConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  reasoningEffort: ReasoningEffortMode;
  timeoutMs: number;
  /** API price of the private endpoint, USD per token. Own hardware: 0. */
  price: { input: number; output: number };
}

const EFFORT_MODES: ReadonlySet<string> = new Set(["pass", "omit", "none", "minimal", "low", "medium", "high", "xhigh", "max"]);

/**
 * Private mode is on when PRIVATE_MODEL_BASE_URL is set. Optional: PRIVATE_MODEL_API_KEY, PRIVATE_MODEL
 * (default muse-glimmer-30b), PRIVATE_MODEL_REASONING_EFFORT (pass | omit | a fixed effort),
 * PRIVATE_MODEL_TIMEOUT_MS (default 600000: local models are slow), PRIVATE_MODEL_USD_PER_MTOK ("input,output").
 * The Meta API key is never sent to a private endpoint.
 */
export function privateModeConfig(env: Env = process.env): PrivateModeConfig | null {
  const baseURL = env.PRIVATE_MODEL_BASE_URL?.trim();
  if (!baseURL) return null;
  const effort = env.PRIVATE_MODEL_REASONING_EFFORT?.trim() || "pass";
  if (!EFFORT_MODES.has(effort)) throw new PrivateModeError(`PRIVATE_MODEL_REASONING_EFFORT must be one of ${[...EFFORT_MODES].join(", ")}`);
  const timeoutMs = Number(env.PRIVATE_MODEL_TIMEOUT_MS || 600_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new PrivateModeError("PRIVATE_MODEL_TIMEOUT_MS must be a positive number");
  const [pin = 0, pout = 0] = (env.PRIVATE_MODEL_USD_PER_MTOK ?? "").split(",").map((x) => Number(x.trim()) || 0);
  return {
    baseURL,
    // llama-server needs no key, but the OpenAI SDK refuses an empty one.
    apiKey: env.PRIVATE_MODEL_API_KEY?.trim() || "not-needed",
    model: readerModel(env),
    reasoningEffort: effort as ReasoningEffortMode,
    timeoutMs,
    price: { input: pin / 1e6, output: pout / 1e6 },
  };
}
