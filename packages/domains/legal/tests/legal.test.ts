import { describe, it, expect } from "vitest";
import { WorldGraph, PredictionEngine, compareStrategies, forkGraph } from "@dcas/core";
import { seedLegalData } from "../src/seed-data.js";
import { legalCascadeRules } from "../src/cascade-rules.js";
import { generateLegalStrategies } from "../src/strategies.js";
import { createRecoveryPredictor, createCostPredictor } from "../src/predictions.js";
import { createLegalObjective } from "../src/objective.js";
import { ENTITY_TYPES, RELATION_TYPES } from "../src/ontology.js";

function createLegalWorld() {
  const world = new WorldGraph();
  const seed = seedLegalData(world);
  for (const rule of legalCascadeRules) {
    world.addCascadeRule(rule);
  }
  return { world, seed };
}

function addCase(world: WorldGraph, seed: ReturnType<typeof seedLegalData>) {
  const plaintiff = world.addEntity(ENTITY_TYPES.Party, {
    name: "张三", type: "individual", role: "plaintiff",
  });
  const defendant = world.addEntity(ENTITY_TYPES.Party, {
    name: "ABC科技公司", type: "corporation", role: "defendant",
  });
  const caseEntity = world.addEntity(ENTITY_TYPES.Case, {
    case_type: "labor_dispute",
    sub_type: "wrongful_termination",
    claim_amount: 120000,
    strategy: "undecided",
    expected_recovery: 0,
    expected_cost: 0,
    duration_months: 0,
    evidence_strength: 7.2,
    status: "filed",
  });
  const budget = world.addEntity(ENTITY_TYPES.Budget, { allocated: 0 });
  const evidence1 = world.addEntity(ENTITY_TYPES.Evidence, {
    type: "chat_record", description: "微信聊天记录", strength: 7,
  });
  const evidence2 = world.addEntity(ENTITY_TYPES.Evidence, {
    type: "payslip", description: "工资条", strength: 9,
  });

  world.addRelation(RELATION_TYPES.plaintiff_in, plaintiff.id, caseEntity.id);
  world.addRelation(RELATION_TYPES.defendant_in, defendant.id, caseEntity.id);
  world.addRelation(RELATION_TYPES.decided_by, caseEntity.id, seed.judges.judgeWang.id);
  world.addRelation(RELATION_TYPES.has_budget, caseEntity.id, budget.id);
  world.addRelation(RELATION_TYPES.has_evidence, caseEntity.id, evidence1.id);
  world.addRelation(RELATION_TYPES.has_evidence, caseEntity.id, evidence2.id);
  world.addRelation(RELATION_TYPES.cites, caseEntity.id, seed.statutes.statute82.id);
  world.addRelation(RELATION_TYPES.cites, caseEntity.id, seed.statutes.statute87.id);

  return { caseEntity, plaintiff, defendant, budget, evidence1, evidence2 };
}

describe("Legal Domain", () => {
  it("should create world with seed data", () => {
    const { world, seed } = createLegalWorld();
    expect(world.getEntitiesByType("Statute")).toHaveLength(4);
    expect(world.getEntitiesByType("Judge")).toHaveLength(3);
    expect(world.getEntitiesByType("Precedent")).toHaveLength(3);
    expect(seed.judges.judgeWang.properties.pro_labor_rate).toBe(0.786);
  });

  it("should add a case with all entities and relations", () => {
    const { world, seed } = createLegalWorld();
    const { caseEntity } = addCase(world, seed);

    expect(world.getEntitiesByType("Case")).toHaveLength(1);
    expect(world.getEntitiesByType("Party")).toHaveLength(2);
    expect(world.getEntitiesByType("Evidence")).toHaveLength(2);

    const neighbors = world.getNeighbors(caseEntity.id, "outgoing");
    expect(neighbors.length).toBeGreaterThanOrEqual(4); // budget + judge + 2 evidence + 2 statutes
  });

  it("should cascade strategy change to budget", () => {
    const { world, seed } = createLegalWorld();
    const { caseEntity, budget } = addCase(world, seed);

    world.updateProperty(caseEntity.id, "strategy", "settlement");
    expect(budget.properties.allocated).toBe(Math.round(120000 * 0.15)); // 18000
  });

  it("should generate legal strategies", () => {
    const { world, seed } = createLegalWorld();
    const { caseEntity } = addCase(world, seed);

    const strategies = generateLegalStrategies(caseEntity.id, 120000);
    expect(strategies).toHaveLength(3);
    expect(strategies.map(s => s.id)).toEqual(["settlement", "full_defense", "jurisdiction"]);
  });

  it("should create prediction models", async () => {
    const { world, seed } = createLegalWorld();
    addCase(world, seed);

    const engine = new PredictionEngine();
    engine.registerModel(createRecoveryPredictor());
    engine.registerModel(createCostPredictor());

    const recovery = await engine.ensemble(world, "expected_recovery");
    expect(recovery.combined.mean).toBeGreaterThan(0);

    // With high evidence (7.2) and pro-labor judge (0.786), should predict high recovery
    expect(recovery.combined.mean).toBeGreaterThan(120000 * 0.6);
  });

  it("should run full simulation with strategies", async () => {
    const { world, seed } = createLegalWorld();
    const { caseEntity } = addCase(world, seed);

    const strategies = generateLegalStrategies(caseEntity.id, 120000);
    const objective = createLegalObjective();
    const engine = new PredictionEngine();
    engine.registerModel(createRecoveryPredictor());
    engine.registerModel(createCostPredictor());

    const ranked = await compareStrategies(world, strategies, objective, engine);

    expect(ranked.rankings).toHaveLength(3);
    expect(ranked.rankings[0].score).toBeGreaterThan(0);
    // Settlement should likely rank high (fast, low cost)
    expect(ranked.rankings[0].strategyName).toBeDefined();
  });

  it("should run Monte Carlo simulation", async () => {
    const { world, seed } = createLegalWorld();
    const { caseEntity } = addCase(world, seed);

    const strategies = generateLegalStrategies(caseEntity.id, 120000);
    const objective = createLegalObjective();
    const engine = new PredictionEngine();
    engine.registerModel(createRecoveryPredictor());
    engine.registerModel(createCostPredictor());

    const ranked = await compareStrategies(
      world, strategies, objective, engine,
      ["expected_recovery", "expected_cost"],
      { runs: 50, seed: 42, maxSteps: 10 },
    );

    expect(ranked.rankings).toHaveLength(3);
    // Each strategy should have KPI distributions
    // (Note: distributions are in the individual SimulationResults, not in RankedStrategy directly.
    // But we can verify ranking works)
    expect(ranked.rankings[0].score).toBeGreaterThanOrEqual(ranked.rankings[1].score);
  });

  it("should not modify original world during simulation", async () => {
    const { world, seed } = createLegalWorld();
    const { caseEntity } = addCase(world, seed);
    const originalStrategy = world.getEntity(caseEntity.id)!.properties.strategy;

    const strategies = generateLegalStrategies(caseEntity.id, 120000);
    const objective = createLegalObjective();
    await compareStrategies(world, strategies, objective);

    expect(world.getEntity(caseEntity.id)!.properties.strategy).toBe(originalStrategy);
  });
});
