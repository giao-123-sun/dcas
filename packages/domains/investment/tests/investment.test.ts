import { describe, it, expect } from "vitest";
import { WorldGraph, PredictionEngine, compareStrategies, SelfModel } from "@dcas/core";
import { seedInvestmentData } from "../src/seed-data.js";
import { seedInvestmentSelfModel } from "../src/self-model.js";
import { generateInvestmentStrategies } from "../src/strategies.js";
import { createSharpePredictor, createDrawdownPredictor } from "../src/predictions.js";
import { createInvestmentObjective } from "../src/objective.js";

function createInvestmentWorld() {
  const world = new WorldGraph();
  const seed = seedInvestmentData(world);
  return { world, seed };
}

describe("Investment Domain", () => {
  it("should create world with portfolio + assets + macro factors", () => {
    const { world } = createInvestmentWorld();
    expect(world.getEntitiesByType("Portfolio")).toHaveLength(1);
    expect(world.getEntitiesByType("Asset")).toHaveLength(7);
    expect(world.getEntitiesByType("Sector")).toHaveLength(4);
    expect(world.getEntitiesByType("MacroFactor")).toHaveLength(3);
    expect(world.relationCount).toBeGreaterThan(10);
  });

  it("should generate 3 investment strategies", () => {
    const { seed } = createInvestmentWorld();
    const strategies = generateInvestmentStrategies(seed.portfolio.id);
    expect(strategies).toHaveLength(3);
    expect(strategies.map(s => s.id)).toEqual(["defensive_rebalance", "aggressive_growth", "balanced_hedge"]);
  });

  it("should create prediction models", async () => {
    const { world } = createInvestmentWorld();
    const engine = new PredictionEngine();
    engine.registerModel(createSharpePredictor());
    engine.registerModel(createDrawdownPredictor());
    const sharpe = await engine.ensemble(world, "current_sharpe");
    expect(sharpe.combined.mean).toBeGreaterThan(0);
    const drawdown = await engine.ensemble(world, "max_drawdown");
    expect(drawdown.combined.mean).toBeGreaterThan(0);
  });

  it("should simulate and rank strategies", async () => {
    const { world, seed } = createInvestmentWorld();
    const strategies = generateInvestmentStrategies(seed.portfolio.id);
    const objective = createInvestmentObjective();
    const engine = new PredictionEngine();
    engine.registerModel(createSharpePredictor());
    engine.registerModel(createDrawdownPredictor());
    const ranked = await compareStrategies(world, strategies, objective, engine);
    expect(ranked.rankings).toHaveLength(3);
    expect(ranked.rankings[0].score).toBeGreaterThan(0);
  });

  it("should enforce max drawdown hard constraint", async () => {
    const { world, seed } = createInvestmentWorld();
    const strategies = generateInvestmentStrategies(seed.portfolio.id);
    const objective = createInvestmentObjective();
    // Aggressive growth has drawdown 0.22 > 0.15 hard constraint
    const ranked = await compareStrategies(world, strategies, objective);
    const aggressive = ranked.rankings.find(r => r.strategyId === "aggressive_growth");
    expect(aggressive).toBeDefined();
    // Should be ranked last or have score=0 due to hard constraint violation
    expect(aggressive!.objectiveResult.hardViolation).toBe(true);
  });

  it("should run Monte Carlo simulation", async () => {
    const { world, seed } = createInvestmentWorld();
    const strategies = generateInvestmentStrategies(seed.portfolio.id);
    const objective = createInvestmentObjective();
    const engine = new PredictionEngine();
    engine.registerModel(createSharpePredictor());
    engine.registerModel(createDrawdownPredictor());
    const ranked = await compareStrategies(world, strategies, objective, engine,
      ["current_sharpe", "max_drawdown"], { runs: 20, seed: 42, maxSteps: 10 });
    expect(ranked.rankings).toHaveLength(3);
    expect(ranked.rankings[0].score).toBeGreaterThanOrEqual(ranked.rankings[1].score);
  });

  it("should not modify original world", async () => {
    const { world, seed } = createInvestmentWorld();
    const origSharpe = world.getEntity(seed.portfolio.id)!.properties.current_sharpe;
    await compareStrategies(world, generateInvestmentStrategies(seed.portfolio.id), createInvestmentObjective());
    expect(world.getEntity(seed.portfolio.id)!.properties.current_sharpe).toBe(origSharpe);
  });
});

describe("Investment Self-Model", () => {
  it("should create fund with team", () => {
    const { world } = createInvestmentWorld();
    const selfData = seedInvestmentSelfModel(world);
    expect(world.getEntitiesByType("Self")).toHaveLength(1);
    expect(world.getEntitiesByType("TeamMember")).toHaveLength(2);
    expect(selfData.fund.properties.aum).toBe(50000000);
  });

  it("should identify risk management as top skill", () => {
    const { world } = createInvestmentWorld();
    const selfData = seedInvestmentSelfModel(world);
    const self = new SelfModel(world);
    const best = self.getBestMemberForTask("investment", "risk_management");
    expect(best?.id).toBe(selfData.pm.id);
  });

  it("should detect derivatives capability gap", () => {
    const { world } = createInvestmentWorld();
    seedInvestmentSelfModel(world);
    const self = new SelfModel(world);
    const gaps = self.getCapabilityGaps([
      { domain: "investment", taskType: "derivatives", minProficiency: 0.7 },
    ]);
    expect(gaps.length).toBeGreaterThan(0);
  });
});
