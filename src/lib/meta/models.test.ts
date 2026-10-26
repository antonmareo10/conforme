import { describe, expect, it } from "vitest";
import { assertAllowedModel, MODELS, ModelNotAllowedError, OPEN_MODELS, readerModel } from "./models";

describe("model allowlist", () => {
  it("allows the standard-mode models Conforme uses", () => {
    for (const m of Object.values(MODELS)) expect(() => assertAllowedModel(m)).not.toThrow();
  });
  it("allows the open-weight models of private mode", () => {
    for (const m of Object.values(OPEN_MODELS)) expect(() => assertAllowedModel(m)).not.toThrow();
  });
  it("refuses every contributor-mode model", () => {
    for (const m of ["muse-spark-1.3-contributor", "muse-spark-1.2-contributor", "anything-contributor", ...Object.values(OPEN_MODELS).map((m) => `${m}-contributor`)])
      expect(() => assertAllowedModel(m)).toThrow(ModelNotAllowedError);
  });
  it("refuses models that are not on the list", () => {
    expect(() => assertAllowedModel("muse-wonder-1.0")).toThrow(/allowlist/);
  });
});

describe("reader model", () => {
  it("is Muse Spark unless private mode is on", () => {
    expect(readerModel({})).toBe(MODELS.read);
    expect(readerModel({ PRIVATE_MODEL: "muse-glimmer-30b" })).toBe(MODELS.read); // a model alone does not switch mode
  });
  it("is the private model in private mode, Muse Glimmer by default", () => {
    const on = { PRIVATE_MODEL_BASE_URL: "http://127.0.0.1:8080/v1" };
    expect(readerModel(on)).toBe(OPEN_MODELS.glimmer);
    expect(readerModel({ ...on, PRIVATE_MODEL: OPEN_MODELS.sparkOpen })).toBe(OPEN_MODELS.sparkOpen);
    expect(readerModel({ ...on, PRIVATE_MODEL: MODELS.read })).toBe(MODELS.read);
  });
  it("never lets private mode pick a contributor or unlisted model", () => {
    const on = { PRIVATE_MODEL_BASE_URL: "http://127.0.0.1:8080/v1" };
    expect(() => readerModel({ ...on, PRIVATE_MODEL: "muse-spark-1.3-contributor" })).toThrow(/contributor/);
    expect(() => readerModel({ ...on, PRIVATE_MODEL: "muse-wonder-1.0" })).toThrow(/allowlist/);
  });
});
