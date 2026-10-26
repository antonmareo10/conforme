import { describe, expect, it } from "vitest";
import { assertAllowedModel, MODELS, ModelNotAllowedError } from "./models";

describe("model allowlist", () => {
  it("allows the standard-mode models Conforme uses", () => {
    for (const m of Object.values(MODELS)) expect(() => assertAllowedModel(m)).not.toThrow();
  });
  it("refuses every contributor-mode model", () => {
    for (const m of ["muse-spark-1.3-contributor", "muse-spark-1.2-contributor", "anything-contributor"])
      expect(() => assertAllowedModel(m)).toThrow(ModelNotAllowedError);
  });
  it("refuses models that are not on the list", () => {
    expect(() => assertAllowedModel("muse-wonder-1.0")).toThrow(/allowlist/);
  });
});
