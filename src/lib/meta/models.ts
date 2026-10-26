// Models Conforme may call. Standard mode only: any "-contributor" model is refused,
// because delivery notes carry business data that must not be used for training.
export const MODELS = {
  read: "muse-spark-1.3",
  segment: "sam-3.1",
  transcribe: "muse-voice-transcribe-1.0",
  image: "muse-image-1.0",
} as const;

export type AllowedModel = (typeof MODELS)[keyof typeof MODELS];

const ALLOWED: ReadonlySet<string> = new Set(Object.values(MODELS));

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
