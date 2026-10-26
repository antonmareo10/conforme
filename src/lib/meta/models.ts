// Models Conforme may call. Standard mode only: any "-contributor" model is refused,
// because delivery notes carry business data that must not be used for training.
export const MODELS = {
  read: "muse-spark-1.3",
  segment: "sam-3.1",
  transcribe: "muse-voice-transcribe-1.0",
  image: "muse-image-1.0",
} as const;

// Open-weight Meta models for private mode (PRIVATE_MODEL_BASE_URL set): they read the notes on our own
// hardware or on a partner's inference endpoint instead of Muse Spark. The contributor refusal still applies.
export const OPEN_MODELS = {
  glimmer: "muse-glimmer-30b",
  sparkOpen: "meta-models/muse-spark-open-1026",
} as const;

export type AllowedModel = (typeof MODELS)[keyof typeof MODELS] | (typeof OPEN_MODELS)[keyof typeof OPEN_MODELS];

const ALLOWED: ReadonlySet<string> = new Set([...Object.values(MODELS), ...Object.values(OPEN_MODELS)]);

export class ModelNotAllowedError extends Error {
  constructor(model: string) {
    super(
      model.endsWith("-contributor")
        ? `Model "${model}" is a contributor-mode model and is never allowed (data could be used for training).`
        : `Model "${model}" is not on Conforme's allowlist.`,
    );
    this.name = "ModelNotAllowedError";
  }
}

export function assertAllowedModel(model: string): asserts model is AllowedModel {
  if (model.endsWith("-contributor") || !ALLOWED.has(model)) throw new ModelNotAllowedError(model);
}

/** Environment variables as the mode switch reads them (process.env, or a plain object in tests). */
export type Env = Readonly<Record<string, string | undefined>>;

/**
 * The one model id for the text/vision calls (reading, second reading, investigator, question intent):
 * Muse Spark, or PRIVATE_MODEL (default Muse Glimmer) when PRIVATE_MODEL_BASE_URL turns private mode on.
 * Always checked against the allowlist.
 */
export function readerModel(env: Env = process.env): AllowedModel {
  const model = env.PRIVATE_MODEL_BASE_URL?.trim() ? env.PRIVATE_MODEL?.trim() || OPEN_MODELS.glimmer : MODELS.read;
  assertAllowedModel(model);
  return model;
}
