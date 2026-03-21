import { describe, it, expect } from "vitest";
import { WorldGraph } from "../../src/world-model/graph.js";
import { PredictionEngine } from "../../src/prediction/engine.js";
import { HeuristicModel } from "../../src/prediction/models/heuristic.js";
import { StatisticalModel } from "../../src/prediction/models/statistical.js";
import {
  normalDistribution,
  skewedDistribution,
  pointEstimate,
  ensembleDistributions,
} from "../../src/prediction/distribution.js";

describe("ProbabilityDistribution", () => {
  it("should create normal distribution with correct percentiles", () => {
    const d = normalDistribution(50000, 10000, 0.8, "test");
    expect(d.mean).toBe(50000);
    expect(d.median).toBe(50000);
    expect(d.std).toBe(10000);
    expect(d.percentiles.p5).toBeLessThan(d.mean);
    expect(d.percentiles.p95).toBeGreaterThan(d.mean);
    // p5 ≈ 50000 - 1.645*10000 = 33550
    expect(d.percentiles.p5).toBeCloseTo(33550, 0);
  });

  it("should create skewed distribution with shifted median", () => {
    const d = skewedDistribution(50000, 10000, 1.0, 0.7, "test");
    // Positive skew → median < mean
    expect(d.median).toBeLessThan(d.mean);
  });

  it("should create point estimate with zero std", () => {
    const d = pointEstimate(42, 1.0, "exact");
    expect(d.mean).toBe(42);
    expect(d.std).toBe(0);
    expect(d.percentiles.p5).toBe(42);
    expect(d.percentiles.p95).toBe(42);
  });

  it("should ensemble multiple distributions", () => {
    const d1 = normalDistribution(60000, 5000, 0.8, "model_a");
    const d2 = normalDistribution(70000, 8000, 0.6, "model_b");
    const combined = ensembleDistributions([d1, d2]);

    // Mean should be between the two (weighted by confidence)
    expect(combined.mean).toBeGreaterThan(60000);
    expect(combined.mean).toBeLessThan(70000);
    // Higher confidence model should pull mean closer to its value
    expect(combined.mean).toBeLessThan(65000); // closer to 60000 (higher conf)
    expect(combined.modelId).toBe("ensemble");
  });

  it("should return single distribution unchanged in ensemble", () => {
    const d = normalDistribution(100, 10, 0.9, "solo");
    const combined = ensembleDistributions([d]);
    expect(combined.mean).toBe(100);
    expect(combined.std).toBe(10);
  });

  it("should throw on empty ensemble", () => {
    expect(() => ensembleDistributions([])).toThrow();
  });
});

describe("HeuristicModel", () => {
  it("should match rules in order and return prediction", () => {
    const model = new HeuristicModel(
      "legal_recovery",
      "expected_recovery",
      [
        {
          description: "强证据高回收",
          condition: (ctx) => {
            const cases = ctx.world.getEntitiesByType("Case");
            return ((cases[0]?.properties.evidence_strength as number) ?? 0) > 7;
          },
          predict: () => ({ mean: 75000, std: 8000, confidence: 0.8 }),
        },
        {
          description: "弱证据低回收",
          condition: (ctx) => {
            const cases = ctx.world.getEntitiesByType("Case");
            return ((cases[0]?.properties.evidence_strength as number) ?? 0) <= 7;
          },
          predict: () => ({ mean: 45000, std: 12000, confidence: 0.6 }),
        },
      ],
      { mean: 50000, std: 15000, confidence: 0.4 },
    );

    // Strong evidence
    const g1 = new WorldGraph();
    g1.addEntity("Case", { evidence_strength: 8.5 });
    const pred1 = model.predict({ world: g1, targetProperty: "expected_recovery" });
    expect(pred1.mean).toBe(75000);

    // Weak evidence
    const g2 = new WorldGraph();
    g2.addEntity("Case", { evidence_strength: 5 });
    const pred2 = model.predict({ world: g2, targetProperty: "expected_recovery" });
    expect(pred2.mean).toBe(45000);
  });

  it("should use fallback when no rule matches", () => {
    const model = new HeuristicModel(
      "test",
      "value",
      [
        {
          description: "never matches",
          condition: () => false,
          predict: () => ({ mean: 999, std: 1, confidence: 1 }),
        },
      ],
      { mean: 42, std: 10, confidence: 0.3 },
    );

    const g = new WorldGraph();
    const pred = model.predict({ world: g, targetProperty: "value" });
    expect(pred.mean).toBe(42);
    expect(pred.confidence).toBe(0.3);
  });
});

describe("StatisticalModel", () => {
  it("should compute linear prediction", () => {
    const model = new StatisticalModel(
      "recovery_regression",
      "expected_recovery",
      [
        {
          name: "evidence_strength",
          extract: (w) => {
            const cases = w.getEntitiesByType("Case");
            return (cases[0]?.properties.evidence_strength as number) ?? 0;
          },
        },
        {
          name: "amount",
          extract: (w) => {
            const cases = w.getEntitiesByType("Case");
            return (cases[0]?.properties.amount as number) ?? 0;
          },
        },
      ],
      [5000, 0.6], // coefficients
      10000,        // intercept
      8000,         // residualStd
    );

    const g = new WorldGraph();
    g.addEntity("Case", { evidence_strength: 7, amount: 80000 });
    const pred = model.predict({ world: g, targetProperty: "expected_recovery" });

    // 10000 + 5000*7 + 0.6*80000 = 10000 + 35000 + 48000 = 93000
    expect(pred.mean).toBeCloseTo(93000, 0);
    expect(pred.std).toBe(8000);
  });

  it("should throw on mismatched features and coefficients", () => {
    expect(
      () =>
        new StatisticalModel(
          "bad",
          "x",
          [{ name: "a", extract: () => 0 }],
          [1, 2], // 2 coefficients for 1 feature
          0,
          1,
        ),
    ).toThrow();
  });
});

describe("PredictionEngine", () => {
  it("should register and use models", () => {
    const engine = new PredictionEngine();
    const model = new HeuristicModel(
      "test_model",
      "recovery",
      [],
      { mean: 50000, std: 10000, confidence: 0.5 },
    );
    engine.registerModel(model);

    const g = new WorldGraph();
    const pred = engine.predict("test_model", g, "recovery");
    expect(pred.mean).toBe(50000);
  });

  it("should ensemble multiple models for same property", () => {
    const engine = new PredictionEngine();

    engine.registerModel(
      new HeuristicModel("h1", "recovery", [], { mean: 60000, std: 5000, confidence: 0.8 }),
    );
    engine.registerModel(
      new HeuristicModel("h2", "recovery", [], { mean: 70000, std: 8000, confidence: 0.6 }),
    );

    const g = new WorldGraph();
    const result = engine.ensemble(g, "recovery");

    expect(result.modelIds).toHaveLength(2);
    expect(result.individual).toHaveLength(2);
    expect(result.combined.mean).toBeGreaterThan(60000);
    expect(result.combined.mean).toBeLessThan(70000);
  });

  it("should throw when no models for property", () => {
    const engine = new PredictionEngine();
    const g = new WorldGraph();
    expect(() => engine.ensemble(g, "nonexistent")).toThrow();
  });

  it("should recalibrate model accuracy", () => {
    const engine = new PredictionEngine();
    const model = new HeuristicModel("m", "v", [], { mean: 0, std: 1, confidence: 0.5 });
    model.accuracy = 0.8;
    engine.registerModel(model);

    // Large deviation → accuracy should decrease
    engine.recalibrate("m", 0.5);
    expect(model.accuracy).toBeLessThan(0.8);

    // Small deviation → accuracy recovers
    engine.recalibrate("m", 0.05);
    const afterSmall = model.accuracy;
    engine.recalibrate("m", 0.02);
    expect(model.accuracy).toBeGreaterThan(afterSmall - 0.1);
  });

  it("should predict multiple properties", () => {
    const engine = new PredictionEngine();
    engine.registerModel(
      new HeuristicModel("m1", "recovery", [], { mean: 60000, std: 5000, confidence: 0.7 }),
    );
    engine.registerModel(
      new HeuristicModel("m2", "cost", [], { mean: 20000, std: 3000, confidence: 0.8 }),
    );

    const g = new WorldGraph();
    const results = engine.predictAll(g, ["recovery", "cost", "nonexistent"]);

    expect(results.size).toBe(2);
    expect(results.get("recovery")!.combined.mean).toBe(60000);
    expect(results.get("cost")!.combined.mean).toBe(20000);
    expect(results.has("nonexistent")).toBe(false);
  });
});
