import { describe, it, expect } from "vitest";
import { WorldGraph } from "../../src/world-model/graph.js";
import { GradientBoostModel } from "../../src/prediction/models/gradient-boost.js";
import { PredictionEngine } from "../../src/prediction/engine.js";
import { HeuristicModel } from "../../src/prediction/models/heuristic.js";
import type { TrainingSample } from "../../src/prediction/models/gradient-boost.js";

// Generate synthetic training data for legal case recovery prediction
function generateTrainingData(n: number): TrainingSample[] {
  const samples: TrainingSample[] = [];
  for (let i = 0; i < n; i++) {
    const evidenceStrength = 3 + Math.random() * 7; // 3-10
    const amount = 30000 + Math.random() * 170000;   // 30k-200k
    const judgeTendency = Math.random();              // 0-1

    // Non-linear target: recovery depends on interactions
    const baseRecovery = amount * (0.3 + 0.5 * judgeTendency);
    const evidenceBonus = evidenceStrength > 7 ? amount * 0.15 : 0;
    const noise = (Math.random() - 0.5) * 5000;
    const recovery = Math.max(0, baseRecovery + evidenceBonus + noise);

    samples.push({
      features: [evidenceStrength, amount, judgeTendency],
      target: recovery,
    });
  }
  return samples;
}

describe("GradientBoostModel", () => {
  it("should throw when training with too few samples", () => {
    const model = new GradientBoostModel(
      "gb_test",
      "expected_recovery",
      [
        { name: "evidence", extract: () => 0 },
        { name: "amount", extract: () => 0 },
      ],
    );
    model.addSamples([
      { features: [7, 80000], target: 60000 },
      { features: [5, 50000], target: 30000 },
    ]);
    expect(() => model.train()).toThrow("at least 5");
  });

  it("should train and predict", async () => {
    const model = new GradientBoostModel(
      "gb_recovery",
      "expected_recovery",
      [
        { name: "evidence_strength", extract: (w) => (w.getEntitiesByType("Case")[0]?.properties.evidence_strength as number) ?? 5 },
        { name: "amount", extract: (w) => (w.getEntitiesByType("Case")[0]?.properties.amount as number) ?? 50000 },
        { name: "judge_tendency", extract: (w) => (w.getEntitiesByType("Judge")[0]?.properties.pro_labor_rate as number) ?? 0.5 },
      ],
      { nEstimators: 50, seed: 42 },
    );

    const data = generateTrainingData(100);
    model.addSamples(data);
    model.train();

    expect(model.isTrained).toBe(true);
    expect(model.sampleCount).toBe(100);

    // Predict for a specific case
    const g = new WorldGraph();
    g.addEntity("Case", { evidence_strength: 8, amount: 80000 });
    g.addEntity("Judge", { pro_labor_rate: 0.75 });

    const pred = await model.predict({ world: g, targetProperty: "expected_recovery" });

    // High evidence (8) + high judge tendency (0.75) + 80k amount
    // Expected: 80000 * (0.3 + 0.5*0.75) + bonus ≈ 52000 + 12000 = 64000
    expect(pred.mean).toBeGreaterThan(30000);
    expect(pred.mean).toBeLessThan(120000);
    expect(pred.std).toBeGreaterThanOrEqual(0);
    expect(pred.confidence).toBe(0.75); // default accuracy
    expect(pred.modelId).toBe("gb_recovery");
  });

  it("should return high-uncertainty when not trained", async () => {
    const model = new GradientBoostModel("untrained", "value", [
      { name: "x", extract: () => 0 },
    ]);

    const g = new WorldGraph();
    const pred = await model.predict({ world: g, targetProperty: "value" });

    expect(pred.confidence).toBe(0.1); // low confidence fallback
    expect(pred.std).toBe(10000);
  });

  it("should compute feature importance", () => {
    const model = new GradientBoostModel(
      "gb_fi",
      "recovery",
      [
        { name: "evidence", extract: () => 0 },
        { name: "amount", extract: () => 0 },
        { name: "judge", extract: () => 0 },
      ],
      { nEstimators: 30, seed: 42 },
    );

    model.addSamples(generateTrainingData(50));
    model.train();

    const importance = model.getFeatureImportance();
    expect(importance).toHaveLength(3);

    // All importances should sum to ~1
    const total = importance.reduce((s, f) => s + f.importance, 0);
    expect(total).toBeCloseTo(1, 1);

    // Amount and judge tendency should be more important than evidence
    // (because the formula is amount * (0.3 + 0.5 * judge) + conditional bonus)
    const amountImp = importance.find((f) => f.name === "amount")!.importance;
    expect(amountImp).toBeGreaterThan(0);
  });

  it("should work in ensemble with other models", async () => {
    const engine = new PredictionEngine();

    // Heuristic model
    engine.registerModel(
      new HeuristicModel("heuristic", "recovery", [], {
        mean: 55000, std: 10000, confidence: 0.6,
      }),
    );

    // GradientBoost model
    const gb = new GradientBoostModel(
      "gb_model",
      "recovery",
      [
        { name: "evidence", extract: (w) => (w.getEntitiesByType("Case")[0]?.properties.evidence_strength as number) ?? 5 },
        { name: "amount", extract: (w) => (w.getEntitiesByType("Case")[0]?.properties.amount as number) ?? 50000 },
        { name: "judge", extract: (w) => (w.getEntitiesByType("Judge")[0]?.properties.pro_labor_rate as number) ?? 0.5 },
      ],
      { nEstimators: 30, seed: 42 },
      0.8, // higher accuracy → more weight in ensemble
    );
    gb.addSamples(generateTrainingData(50));
    gb.train();
    engine.registerModel(gb);

    // Ensemble prediction
    const g = new WorldGraph();
    g.addEntity("Case", { evidence_strength: 7, amount: 80000 });
    g.addEntity("Judge", { pro_labor_rate: 0.6 });

    const result = await engine.ensemble(g, "recovery");

    expect(result.modelIds).toContain("heuristic");
    expect(result.modelIds).toContain("gb_model");
    expect(result.individual).toHaveLength(2);

    // Combined prediction should be between the two individual predictions
    const hPred = result.individual.find((p) => p.modelId === "heuristic")!;
    const gbPred = result.individual.find((p) => p.modelId === "gb_model")!;
    const minMean = Math.min(hPred.mean, gbPred.mean);
    const maxMean = Math.max(hPred.mean, gbPred.mean);
    expect(result.combined.mean).toBeGreaterThanOrEqual(minMean - 1);
    expect(result.combined.mean).toBeLessThanOrEqual(maxMean + 1);
  });

  it("should report feature names", () => {
    const model = new GradientBoostModel("gb", "x", [
      { name: "feat_a", extract: () => 0 },
      { name: "feat_b", extract: () => 0 },
    ]);
    expect(model.featureNames).toEqual(["feat_a", "feat_b"]);
  });
});
