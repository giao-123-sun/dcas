import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../../src/config.js";

describe("DCASConfig", () => {
  it("should have all default values defined", () => {
    expect(DEFAULT_CONFIG.prediction.recalibrateEmaWeight).toBe(0.8);
    expect(DEFAULT_CONFIG.learning.smallDeviationThreshold).toBe(0.05);
    expect(DEFAULT_CONFIG.learning.largeDeviationThreshold).toBe(0.15);
    expect(DEFAULT_CONFIG.pattern.maxExamples).toBe(10);
    expect(DEFAULT_CONFIG.metaclaw.feedbackDeviationThreshold).toBe(0.1);
  });

  it("should deep merge partial config", () => {
    const merged = mergeConfig({ learning: { smallDeviationThreshold: 0.01 } });
    expect(merged.learning.smallDeviationThreshold).toBe(0.01);
    expect(merged.learning.largeDeviationThreshold).toBe(0.15);
    expect(merged.prediction.recalibrateEmaWeight).toBe(0.8);
  });

  it("should not mutate DEFAULT_CONFIG", () => {
    const merged = mergeConfig({ prediction: { minStd: 999 } });
    expect(merged.prediction.minStd).toBe(999);
    expect(DEFAULT_CONFIG.prediction.minStd).toBe(0.01);
  });
});
