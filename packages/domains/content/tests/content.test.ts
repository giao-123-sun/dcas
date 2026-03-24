import { describe, it, expect } from "vitest";
import { WorldGraph, PredictionEngine, compareStrategies } from "@dcas/core";
import { seedContentData } from "../src/seed-data.js";
import { generateContentStrategies } from "../src/strategies.js";
import { createEngagementPredictor, createGrowthPredictor } from "../src/predictions.js";
import { createContentObjective } from "../src/objective.js";

function createContentWorld() {
  const world = new WorldGraph();
  const seed = seedContentData(world);
  return { world, seed };
}

describe("Content Domain", () => {
  it("should create world with seed data", () => {
    const { world } = createContentWorld();
    expect(world.getEntitiesByType("Account")).toHaveLength(1);
    expect(world.getEntitiesByType("Platform")).toHaveLength(1);
    expect(world.getEntitiesByType("Competitor")).toHaveLength(2);
    expect(world.getEntitiesByType("ContentPlan")).toHaveLength(1);
  });

  it("should generate 3 strategies", () => {
    const { seed } = createContentWorld();
    const s = generateContentStrategies(seed.plan.id);
    expect(s).toHaveLength(3);
    expect(s.map(x => x.id)).toEqual(["deep_focus", "trend_chase", "balanced"]);
  });

  it("should run predictions", async () => {
    const { world } = createContentWorld();
    const engine = new PredictionEngine();
    engine.registerModel(createEngagementPredictor());
    engine.registerModel(createGrowthPredictor());
    const e = await engine.ensemble(world, "predicted_engagement_30d");
    expect(e.combined.mean).toBeGreaterThan(0);
    const g = await engine.ensemble(world, "predicted_followers_30d");
    expect(g.combined.mean).toBeGreaterThan(0);
  });

  it("should simulate and rank strategies", async () => {
    const { world, seed } = createContentWorld();
    const strategies = generateContentStrategies(seed.plan.id);
    const objective = createContentObjective();
    const engine = new PredictionEngine();
    engine.registerModel(createEngagementPredictor());
    engine.registerModel(createGrowthPredictor());
    const ranked = await compareStrategies(world, strategies, objective, engine);
    expect(ranked.rankings).toHaveLength(3);
    expect(ranked.rankings[0].score).toBeGreaterThan(0);
  });

  it("should run MC simulation", async () => {
    const { world, seed } = createContentWorld();
    const strategies = generateContentStrategies(seed.plan.id);
    const objective = createContentObjective();
    const engine = new PredictionEngine();
    engine.registerModel(createEngagementPredictor());
    engine.registerModel(createGrowthPredictor());
    const ranked = await compareStrategies(world, strategies, objective, engine, ["predicted_engagement_30d", "predicted_followers_30d"], { runs: 20, seed: 42, maxSteps: 10 });
    expect(ranked.rankings).toHaveLength(3);
    expect(ranked.rankings[0].score).toBeGreaterThanOrEqual(ranked.rankings[1].score);
  });

  it("should not modify original world", async () => {
    const { world, seed } = createContentWorld();
    const orig = world.getEntity(seed.plan.id)!.properties.strategy;
    await compareStrategies(world, generateContentStrategies(seed.plan.id), createContentObjective());
    expect(world.getEntity(seed.plan.id)!.properties.strategy).toBe(orig);
  });
});
