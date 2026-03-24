import { Router } from "express";
import { WorldGraph, PredictionEngine, compareStrategies, evaluateObjective, DecisionStore, PatternMemory, learnFromOutcome } from "@dcas/core";
import type { MonteCarloConfig } from "@dcas/core";
import { seedLegalData, legalCascadeRules, generateLegalStrategies, createRecoveryPredictor, createCostPredictor, createLegalObjective, ENTITY_TYPES, RELATION_TYPES } from "@dcas/legal";

export const router = Router();
const decisionStore = new DecisionStore();
const patternMemory = new PatternMemory();

router.post("/simulate", async (req, res) => {
  try {
    const { caseType = "labor_dispute", claimAmount = 120000, evidenceStrength = 7, judgeIndex = 0, mcRuns = 50 } = req.body;
    const world = new WorldGraph();
    const seed = seedLegalData(world);
    for (const rule of legalCascadeRules) world.addCascadeRule(rule);
    const judges = [seed.judges.judgeWang, seed.judges.judgeLi, seed.judges.judgeZhao];
    const judge = judges[judgeIndex] ?? judges[0];
    const plaintiff = world.addEntity(ENTITY_TYPES.Party, { name: "原告", type: "individual", role: "plaintiff" });
    const defendant = world.addEntity(ENTITY_TYPES.Party, { name: "被告企业", type: "corporation", role: "defendant" });
    const caseEntity = world.addEntity(ENTITY_TYPES.Case, { case_type: caseType, claim_amount: claimAmount, strategy: "undecided", expected_recovery: 0, expected_cost: 0, duration_months: 0, evidence_strength: evidenceStrength, status: "filed" });
    const budget = world.addEntity(ENTITY_TYPES.Budget, { allocated: 0 });
    world.addRelation(RELATION_TYPES.plaintiff_in, plaintiff.id, caseEntity.id);
    world.addRelation(RELATION_TYPES.defendant_in, defendant.id, caseEntity.id);
    world.addRelation(RELATION_TYPES.decided_by, caseEntity.id, judge.id);
    world.addRelation(RELATION_TYPES.has_budget, caseEntity.id, budget.id);
    const engine = new PredictionEngine();
    engine.registerModel(createRecoveryPredictor());
    engine.registerModel(createCostPredictor());
    const strategies = generateLegalStrategies(caseEntity.id, claimAmount);
    const objective = createLegalObjective();
    const mcConfig: MonteCarloConfig = { runs: mcRuns, seed: 42, maxSteps: 10 };
    const rankings = await compareStrategies(world, strategies, objective, engine, ["expected_recovery", "expected_cost"], mcConfig);
    const record = decisionStore.recordDecision({ world, rankings, chosenStrategyId: rankings.rankings[0]?.strategyId ?? "none", chosenBy: "auto", reasonForChoice: rankings.rankings[0]?.reasoning ?? "", objectiveResult: rankings.rankings[0]?.objectiveResult ?? evaluateObjective(objective, world) });
    res.json({
      decisionId: record.id,
      rankings: rankings.rankings.map(r => ({ rank: r.rank, strategyId: r.strategyId, strategyName: r.strategyName, score: r.score, reasoning: r.reasoning, riskProfile: r.riskProfile, kpis: r.objectiveResult.kpiResults.map(k => ({ id: k.kpiId, name: k.name, value: k.value, normalizedScore: k.normalizedScore })) })),
      worldSummary: { entityCount: world.entityCount, relationCount: world.relationCount },
    });
  } catch (err) {
    console.error("Simulation error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post("/feedback", (req, res) => {
  try {
    const { decisionId, actualKPIValues, deviations, unexpectedEffects = [] } = req.body;
    if (!decisionId || !actualKPIValues || !deviations) { res.status(400).json({ error: "Missing required fields" }); return; }
    const success = decisionStore.recordOutcome(decisionId, { timestamp: Date.now(), actualKPIValues, deviations, unexpectedEffects });
    if (!success) { res.status(404).json({ error: "Decision not found" }); return; }
    const record = decisionStore.get(decisionId);
    const updates = record ? learnFromOutcome(record, patternMemory) : [];
    res.json({ status: "recorded", learningUpdates: updates.length, patterns: patternMemory.count });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.get("/history", (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const strategy = req.query.strategy as string | undefined;
  let records = strategy ? decisionStore.getByStrategy(strategy) : decisionStore.getRecent(limit);
  if (strategy) records = records.slice(0, limit);
  res.json({ total: decisionStore.count, records: records.map(r => ({ id: r.id, timestamp: r.timestamp, chosenStrategyId: r.chosenStrategyId, chosenBy: r.chosenBy, hasOutcome: r.outcome != null })) });
});

router.get("/patterns", (req, res) => {
  const minConfidence = parseFloat(req.query.minConfidence as string) || 0;
  const patterns = minConfidence > 0 ? patternMemory.getHighConfidence(minConfidence) : patternMemory.getAll();
  res.json({ total: patternMemory.count, patterns: patterns.map(p => ({ id: p.id, description: p.description, confidence: p.confidence, supportCount: p.supportCount })) });
});
