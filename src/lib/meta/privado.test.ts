import { describe, expect, it } from "vitest";
import type { ChatCompletion } from "openai/resources/chat/completions";
import type { FunctionTool, ResponseFunctionToolCall, ResponseInputItem } from "openai/resources/responses/responses";
import { extractJson, privateModeConfig, privateResponses, PrivateModeError, type ChatClient, type ChatRequest } from "./privado";

type Reply = Pick<ChatCompletion, "id" | "model" | "choices" | "usage">;

/** A chat completions endpoint that records every request and answers from a script. */
function fakeChat(replies: Reply[]) {
  const requests: ChatRequest[] = [];
  const chat: ChatClient = {
    chat: {
      completions: {
        async create(body) {
          requests.push(structuredClone(body));
          const r = replies.shift();
          if (!r) throw new Error("no scripted reply left");
          return r;
        },
      },
    },
  };
  return { chat, requests };
}

const reply = (message: Partial<ChatCompletion.Choice["message"]>, finish: ChatCompletion.Choice["finish_reason"] = "stop", usage?: Reply["usage"]): Reply => ({
  id: "chatcmpl-1",
  model: "muse-glimmer-30b",
  choices: [{ index: 0, finish_reason: finish, logprobs: null, message: { role: "assistant", content: null, refusal: null, ...message } }],
  usage,
});

const SCHEMA = { type: "object", additionalProperties: false, required: ["total"], properties: { total: { type: ["string", "null"] } } };
const IMAGE = "data:image/jpeg;base64,/9j/AAAA";

describe("private mode adapter (Responses API over chat completions)", () => {
  it("maps a strict json_schema reading with an image and returns parseable output_text", async () => {
    const { chat, requests } = fakeChat([reply({ content: '{"total":"12,40"}' }, "stop", { prompt_tokens: 1500, completion_tokens: 300, total_tokens: 1800, completion_tokens_details: { reasoning_tokens: 120 } })]);
    const client = privateResponses(chat);
    const r = await client.responses.create({
      model: "muse-glimmer-30b",
      reasoning: { effort: "low" },
      input: [{ role: "user", content: [{ type: "input_text", text: "Copy the total." }, { type: "input_image", image_url: IMAGE, detail: "auto" }] }],
      text: { format: { type: "json_schema", name: "albaran", schema: SCHEMA, strict: true } },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      model: "muse-glimmer-30b",
      reasoning_effort: "low",
      messages: [{ role: "user", content: [{ type: "text", text: "Copy the total." }, { type: "image_url", image_url: { url: IMAGE, detail: "auto" } }] }],
      response_format: { type: "json_schema", json_schema: { name: "albaran", schema: SCHEMA, strict: true } },
    });
    expect(JSON.parse(r.output_text)).toEqual({ total: "12,40" });
    expect(r.status).toBe("completed");
    expect(r.output).toEqual([{ id: "msg_chatcmpl-1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"total":"12,40"}', annotations: [] }] }]);
    expect(r.usage).toEqual({
      input_tokens: 1500,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens: 300,
      output_tokens_details: { reasoning_tokens: 120 },
      total_tokens: 1800,
    });
  });

  it("sends developer turns as system, plain strings as text, and keeps image parts in order", async () => {
    const { chat, requests } = fakeChat([reply({ content: "{}" })]);
    await privateResponses(chat).responses.create({
      model: "m",
      input: [
        { role: "developer", content: "You turn questions into queries." },
        { role: "user", content: [{ type: "input_image", image_url: IMAGE, detail: "high" }, { type: "input_text", text: "and this one?" }, { type: "input_image", image_url: IMAGE, detail: "low" }] },
        { role: "user", content: "plain text" },
      ],
    });
    expect(requests[0].messages).toEqual([
      { role: "system", content: "You turn questions into queries." },
      { role: "user", content: [{ type: "image_url", image_url: { url: IMAGE, detail: "high" } }, { type: "text", text: "and this one?" }, { type: "image_url", image_url: { url: IMAGE, detail: "low" } }] },
      { role: "user", content: "plain text" },
    ]);
    expect(requests[0].response_format).toBeUndefined();
    expect(requests[0].reasoning_effort).toBeUndefined();
  });

  it("runs a two-round tool loop exactly as the investigator replays it", async () => {
    const tools: FunctionTool[] = [
      { type: "function", name: "releer_celda", description: "Re-read one cell.", strict: true, parameters: { type: "object", additionalProperties: false, required: ["linea"], properties: { linea: { type: "integer" } } } },
      { type: "function", name: "cerrar", description: "Close.", strict: true, parameters: { type: "object", additionalProperties: false, required: ["veredicto"], properties: { veredicto: { type: "string" } } } },
    ];
    const { chat, requests } = fakeChat([
      reply({ content: "Re-reading line 2.", tool_calls: [{ id: "call_a", type: "function", function: { name: "releer_celda", arguments: '{"linea":2}' } }] }, "tool_calls"),
      reply({ tool_calls: [{ id: "call_b", type: "function", function: { name: "cerrar", arguments: '{"veredicto":"lectura_confirmada"}' } }] }, "tool_calls"),
    ]);
    const client = privateResponses(chat);
    const input: ResponseInputItem[] = [{ role: "developer", content: "Investigate." }, { role: "user", content: '{"avisos":[]}' }];

    // Round 1: the model asks for a tool.
    const r1 = await client.responses.create({ model: "m", reasoning: { effort: "low" }, tools, input });
    const calls1 = r1.output.filter((o): o is ResponseFunctionToolCall => o.type === "function_call");
    expect(calls1).toEqual([{ type: "function_call", id: "fc_call_a", call_id: "call_a", name: "releer_celda", arguments: '{"linea":2}', status: "completed" }]);
    input.push(...(r1.output as ResponseInputItem[]));
    input.push({ type: "function_call_output", call_id: calls1[0].call_id, output: '{"evidenciaId":"ev1","relectura":"3,50"}' });

    // Round 2: the replayed turn arrives as one assistant message with its tool call, then the tool result.
    const r2 = await client.responses.create({ model: "m", reasoning: { effort: "low" }, tools, input });
    expect(requests[1].messages).toEqual([
      { role: "system", content: "Investigate." },
      { role: "user", content: '{"avisos":[]}' },
      { role: "assistant", content: "Re-reading line 2.", tool_calls: [{ id: "call_a", type: "function", function: { name: "releer_celda", arguments: '{"linea":2}' } }] },
      { role: "tool", tool_call_id: "call_a", content: '{"evidenciaId":"ev1","relectura":"3,50"}' },
    ]);
    expect(requests[1].tools).toEqual(tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters, strict: true } })));
    expect(requests[1].tool_choice).toBeUndefined();
    const calls2 = r2.output.filter((o): o is ResponseFunctionToolCall => o.type === "function_call");
    expect(calls2.map((c) => [c.name, JSON.parse(c.arguments)])).toEqual([["cerrar", { veredicto: "lectura_confirmada" }]]);
    expect(r2.output_text).toBe("");
  });

  it("groups several tool calls of one turn and gives ids to calls that come without one", async () => {
    const { chat, requests } = fakeChat([
      reply({ tool_calls: [{ id: "", type: "function", function: { name: "pedido", arguments: '{"linea":1}' } }, { id: "x2", type: "function", function: { name: "historial_precio", arguments: "" } }] }, "tool_calls"),
      reply({ content: "ok" }),
    ]);
    const client = privateResponses(chat);
    const input: ResponseInputItem[] = [{ role: "user", content: "go" }];
    const r1 = await client.responses.create({ model: "m", input });
    const calls = r1.output.filter((o): o is ResponseFunctionToolCall => o.type === "function_call");
    expect(calls.map((c) => [c.call_id, c.arguments])).toEqual([["call_chatcmpl-1_0", '{"linea":1}'], ["x2", "{}"]]);
    input.push(...(r1.output as ResponseInputItem[]));
    for (const c of calls) input.push({ type: "function_call_output", call_id: c.call_id, output: "{}" });
    await client.responses.create({ model: "m", input });
    expect(requests[1].messages.map((m) => m.role)).toEqual(["user", "assistant", "tool", "tool"]);
  });

  it("maps usage, a missing usage and a truncated answer", async () => {
    const { chat } = fakeChat([
      reply({ content: '{"total":' }, "length", { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }),
      reply({ content: "{}" }),
    ]);
    const client = privateResponses(chat);
    const cut = await client.responses.create({ model: "m", input: "x", text: { format: { type: "json_schema", name: "n", schema: SCHEMA, strict: true } } });
    expect(cut.status).toBe("incomplete");
    expect(cut.incomplete_details).toEqual({ reason: "max_output_tokens" });
    expect(cut.usage?.output_tokens_details.reasoning_tokens).toBe(0);
    expect(cut.usage?.input_tokens).toBe(10);
    const none = await client.responses.create({ model: "m", input: "x" });
    expect(none.usage).toBeUndefined();
  });

  it("can omit or override reasoning_effort for servers that reject it", async () => {
    const { chat, requests } = fakeChat([reply({ content: "a" }), reply({ content: "b" })]);
    await privateResponses(chat, { reasoningEffort: "omit" }).responses.create({ model: "m", reasoning: { effort: "low" }, input: "x" });
    await privateResponses(chat, { reasoningEffort: "high" }).responses.create({ model: "m", reasoning: { effort: "minimal" }, input: "x" });
    expect(requests[0]).not.toHaveProperty("reasoning_effort");
    expect(requests[1].reasoning_effort).toBe("high");
  });

  it("sends the effort as Muse Glimmer's template reasoning_strength in template mode", async () => {
    const { chat, requests } = fakeChat([reply({ content: "a" }), reply({ content: "b" }), reply({ content: "c" })]);
    const client = privateResponses(chat, { reasoningEffort: "template" });
    await client.responses.create({ model: "muse-glimmer-30b", reasoning: { effort: "minimal" }, input: "x" });
    await client.responses.create({ model: "muse-glimmer-30b", reasoning: { effort: "high" }, input: "x" });
    await client.responses.create({ model: "muse-glimmer-30b", input: "x" });
    expect(requests.map((r) => [r.chat_template_kwargs, r.reasoning_effort])).toEqual([
      [{ reasoning_strength: "low" }, undefined],
      [{ reasoning_strength: "high" }, undefined],
      [undefined, undefined],
    ]);
  });

  it("strips think blocks and code fences around requested JSON only", async () => {
    expect(extractJson('<think>let me see</think>\n```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('  {"a":1}\n')).toBe('{"a":1}');
    const { chat } = fakeChat([reply({ content: "```json\n{}\n```" })]);
    const r = await privateResponses(chat).responses.create({ model: "m", input: "x" });
    expect(r.output_text).toBe("```json\n{}\n```"); // no JSON format asked: text untouched
  });

  it("refuses what it cannot translate instead of dropping it", async () => {
    const { chat } = fakeChat([]);
    const client = privateResponses(chat);
    await expect(client.responses.create({ model: "m", input: "x", previous_response_id: "resp_1" })).rejects.toThrow(PrivateModeError);
    await expect(client.responses.create({ model: "m", input: "x", tools: [{ type: "web_search" }] })).rejects.toThrow(/only function tools/);
    await expect(client.responses.create({ model: "m", input: [{ role: "developer", content: [{ type: "input_image", image_url: IMAGE, detail: "auto" }] }] })).rejects.toThrow(/only carry text/);
    await expect(client.responses.create({ model: "m", input: [{ type: "function_call_output", output: "{}" }] })).rejects.toThrow(/call_id/);
    await expect(client.responses.create({ input: "x" })).rejects.toThrow(/model is required/);
  });
});

describe("private mode config", () => {
  it("is off without PRIVATE_MODEL_BASE_URL", () => {
    expect(privateModeConfig({})).toBeNull();
    expect(privateModeConfig({ PRIVATE_MODEL: "muse-glimmer-30b", PRIVATE_MODEL_BASE_URL: " " })).toBeNull();
  });
  it("defaults to Muse Glimmer, no key, a long timeout and zero API cost", () => {
    expect(privateModeConfig({ PRIVATE_MODEL_BASE_URL: "http://127.0.0.1:8080/v1" })).toEqual({
      baseURL: "http://127.0.0.1:8080/v1",
      apiKey: "not-needed",
      model: "muse-glimmer-30b",
      reasoningEffort: "template",
      timeoutMs: 600_000,
      price: { input: 0, output: 0 },
    });
  });
  it("reads key, model, effort mode, timeout and price", () => {
    const cfg = privateModeConfig({
      PRIVATE_MODEL_BASE_URL: "https://example.invalid/v1",
      PRIVATE_MODEL_API_KEY: "k",
      PRIVATE_MODEL: "meta-models/muse-spark-open-1026",
      PRIVATE_MODEL_REASONING_EFFORT: "omit",
      PRIVATE_MODEL_TIMEOUT_MS: "120000",
      PRIVATE_MODEL_USD_PER_MTOK: "0.5, 2",
    });
    expect(cfg).toMatchObject({ apiKey: "k", model: "meta-models/muse-spark-open-1026", reasoningEffort: "omit", timeoutMs: 120_000, price: { input: 0.5e-6, output: 2e-6 } });
  });
  it("refuses contributor models, unknown models and bad settings", () => {
    const base = { PRIVATE_MODEL_BASE_URL: "http://127.0.0.1:8080/v1" };
    expect(() => privateModeConfig({ ...base, PRIVATE_MODEL: "muse-glimmer-30b-contributor" })).toThrow(/contributor/);
    expect(() => privateModeConfig({ ...base, PRIVATE_MODEL: "some-other-model" })).toThrow(/allowlist/);
    expect(() => privateModeConfig({ ...base, PRIVATE_MODEL_REASONING_EFFORT: "turbo" })).toThrow(PrivateModeError);
    expect(() => privateModeConfig({ ...base, PRIVATE_MODEL_TIMEOUT_MS: "-1" })).toThrow(PrivateModeError);
  });
});
