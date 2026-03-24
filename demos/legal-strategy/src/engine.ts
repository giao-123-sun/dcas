import { WorldGraph, PredictionEngine, compareStrategies } from "@dcas/core";
import type { RankedStrategies, MonteCarloConfig } from "@dcas/core";
import {
  seedLegalData,
  legalCascadeRules,
  generateLegalStrategies,
  createRecoveryPredictor,
  createCostPredictor,
  createLegalObjective,
  ENTITY_TYPES,
  RELATION_TYPES,
} from "@dcas/legal";

export interface CaseInput {
  caseType: string;
  claimAmount: number;
  evidenceStrength: number; // 1-10
  judgeIndex: number; // 0, 1, or 2
}

export interface SimulationOutput {
  rankings: RankedStrategies;
  worldSummary: {
    entities: Array<{ id: string; type: string; label: string }>;
    relations: Array<{ source: string; target: string; type: string }>;
  };
  kpiSummary: Array<{
    strategyName: string;
    strategyId: string;
    rank: number;
    score: number;
    recovery: number;
    cost: number;
    speed: number;
    reasoning: string;
  }>;
}

export async function runSimulation(
  input: CaseInput,
  mcRuns = 50,
): Promise<SimulationOutput> {
  // Build world
  const world = new WorldGraph();
  const seed = seedLegalData(world);
  for (const rule of legalCascadeRules) {
    world.addCascadeRule(rule);
  }

  // Add case
  const judges = [
    seed.judges.judgeWang,
    seed.judges.judgeLi,
    seed.judges.judgeZhao,
  ];
  const judge = judges[input.judgeIndex] ?? judges[0];

  const plaintiff = world.addEntity(ENTITY_TYPES.Party, {
    name: "原告",
    type: "individual",
    role: "plaintiff",
  });
  const defendant = world.addEntity(ENTITY_TYPES.Party, {
    name: "被告企业",
    type: "corporation",
    role: "defendant",
  });
  const caseEntity = world.addEntity(ENTITY_TYPES.Case, {
    case_type: input.caseType,
    claim_amount: input.claimAmount,
    strategy: "undecided",
    expected_recovery: 0,
    expected_cost: 0,
    duration_months: 0,
    evidence_strength: input.evidenceStrength,
    status: "filed",
  });
  const budget = world.addEntity(ENTITY_TYPES.Budget, { allocated: 0 });

  world.addRelation(RELATION_TYPES.plaintiff_in, plaintiff.id, caseEntity.id);
  world.addRelation(RELATION_TYPES.defendant_in, defendant.id, caseEntity.id);
  world.addRelation(RELATION_TYPES.decided_by, caseEntity.id, judge.id);
  world.addRelation(RELATION_TYPES.has_budget, caseEntity.id, budget.id);

  // Set up prediction engine
  const engine = new PredictionEngine();
  engine.registerModel(createRecoveryPredictor());
  engine.registerModel(createCostPredictor());

  // Generate strategies
  const strategies = generateLegalStrategies(caseEntity.id, input.claimAmount);
  const objective = createLegalObjective();

  // Run simulation
  const mcConfig: MonteCarloConfig = {
    runs: mcRuns,
    seed: 42,
    maxSteps: 10,
  };
  const rankings = await compareStrategies(
    world,
    strategies,
    objective,
    engine,
    ["expected_recovery", "expected_cost"],
    mcConfig,
  );

  // Build world summary for visualization
  const entities = world.getAllEntities().map((e) => ({
    id: e.id,
    type: e.type,
    label:
      (e.properties.name as string) ||
      (e.properties.article as string) ||
      (e.properties.case_type as string) ||
      e.type,
  }));
  const relations = world.getAllRelations().map((r) => ({
    source: r.sourceId,
    target: r.targetId,
    type: r.type,
  }));

  // Build KPI summary
  const kpiSummary = rankings.rankings.map((r) => ({
    strategyName: r.strategyName,
    strategyId: r.strategyId,
    rank: r.rank,
    score: r.score,
    recovery:
      r.objectiveResult.kpiResults.find((k) => k.kpiId === "recovery")
        ?.value ?? 0,
    cost:
      r.objectiveResult.kpiResults.find((k) => k.kpiId === "cost")?.value ?? 0,
    speed:
      r.objectiveResult.kpiResults.find((k) => k.kpiId === "speed")?.value ??
      0,
    reasoning: r.reasoning,
  }));

  return { rankings, worldSummary: { entities, relations }, kpiSummary };
}
