import { describe, it, expect } from "vitest";
import { WorldGraph } from "../../src/world-model/graph.js";
import { DecisionStore } from "../../src/memory/decision-store.js";
import { PatternMemory } from "../../src/memory/pattern.js";
import { learnFromOutcome, analyzeDecisionHistory } from "../../src/memory/learning.js";
import { compareStrategies } from "../../src/simulation/comparator.js";
import { evaluateObjective } from "../../src/objective/objective.js";
import type { Strategy } from "../../src/simulation/types.js";
import type { ObjectiveSpec } from "../../src/objective/types.js";
import type { DecisionRecord } from "../../src/memory/types.js";

function buildWorld() {
  const g = new WorldGraph();
  const caseE = g.addEntity("Case", {
    strategy: "settlement",
    expected_recovery: 65000,
    expected_cost: 10000,
    duration_months: 1,
    amount: 80000,
  });
  return { g, caseE };
}

function buildObjective(): ObjectiveSpec {
  return {
    kpis: [
      {
        id: "recovery", name: "回收", direction: "maximize", weight: 0.6, target: 80000,
        compute: (w) => (w.getEntitiesByType("Case")[0]?.properties.expected_recovery as number) ?? 0,
      },
      {
        id: "cost", name: "成本", direction: "minimize", weight: 0.4, target: 50000,
        compute: (w) => (w.getEntitiesByType("Case")[0]?.properties.expected_cost as number) ?? 0,
      },
    ],
    constraints: [],
    tradeoffs: [],
  };
}

function buildStrategy(caseId: string): Strategy {
  return {
    id: "settlement", name: "和解", description: "和解", generatedBy: "template",
    actions: [
      { description: "设回收", entityId: caseId as any, property: "expected_recovery", value: 65000 },
      { description: "设成本", entityId: caseId as any, property: "expected_cost", value: 10000 },
    ],
  };
}

describe("DecisionStore", () => {
  it("should record and retrieve decisions", async () => {
    const store = new DecisionStore();
    const { g, caseE } = buildWorld();
    const objective = buildObjective();
    const strategy = buildStrategy(caseE.id);
    const rankings = await compareStrategies(g, [strategy], objective);
    const objResult = evaluateObjective(objective, g);

    const record = store.recordDecision({
      world: g,
      rankings,
      chosenStrategyId: "settlement",
      chosenBy: "human",
      reasonForChoice: "综合得分最高",
      objectiveResult: objResult,
    });

    expect(record.id).toBeDefined();
    expect(store.count).toBe(1);
    expect(store.get(record.id)).toBe(record);
    expect(record.chosenStrategyId).toBe("settlement");
  });

  it("should record outcome post-hoc", async () => {
    const store = new DecisionStore();
    const { g, caseE } = buildWorld();
    const objective = buildObjective();
    const rankings = await compareStrategies(g, [buildStrategy(caseE.id)], objective);

    const record = store.recordDecision({
      world: g, rankings, chosenStrategyId: "settlement",
      chosenBy: "human", reasonForChoice: "test",
      objectiveResult: evaluateObjective(objective, g),
    });

    const success = store.recordOutcome(record.id, {
      timestamp: Date.now(),
      actualKPIValues: { recovery: 62000, cost: 12000 },
      deviations: { recovery: -0.046, cost: 0.2 },
      unexpectedEffects: [],
    });

    expect(success).toBe(true);
    expect(store.get(record.id)!.outcome).toBeDefined();
    expect(store.outcomeCount).toBe(1);
  });

  it("should query by strategy", async () => {
    const store = new DecisionStore();
    const { g, caseE } = buildWorld();
    const objective = buildObjective();
    const rankings = await compareStrategies(g, [buildStrategy(caseE.id)], objective);
    const objResult = evaluateObjective(objective, g);

    store.recordDecision({ world: g, rankings, chosenStrategyId: "settlement", chosenBy: "human", reasonForChoice: "", objectiveResult: objResult });
    store.recordDecision({ world: g, rankings, chosenStrategyId: "defense", chosenBy: "human", reasonForChoice: "", objectiveResult: objResult });
    store.recordDecision({ world: g, rankings, chosenStrategyId: "settlement", chosenBy: "auto", reasonForChoice: "", objectiveResult: objResult });

    expect(store.getByStrategy("settlement")).toHaveLength(2);
    expect(store.getByStrategy("defense")).toHaveLength(1);
  });

  it("should get recent decisions", async () => {
    const store = new DecisionStore();
    const { g, caseE } = buildWorld();
    const objective = buildObjective();
    const rankings = await compareStrategies(g, [buildStrategy(caseE.id)], objective);
    const objResult = evaluateObjective(objective, g);

    for (let i = 0; i < 5; i++) {
      store.recordDecision({ world: g, rankings, chosenStrategyId: `s${i}`, chosenBy: "human", reasonForChoice: "", objectiveResult: objResult });
    }

    expect(store.getRecent(3)).toHaveLength(3);
    expect(store.count).toBe(5);
  });
});

describe("PatternMemory", () => {
  it("should add and query patterns", () => {
    const mem = new PatternMemory();
    mem.addPattern({
      description: "和解在劳动案件中效果好",
      condition: { entityTypes: ["Case", "Judge"], strategyTypes: ["settlement"] },
      observation: "平均偏差3%",
      confidence: 0.6,
      exampleDecisionId: "d1",
    });

    expect(mem.count).toBe(1);
    const matches = mem.query({ strategyTypes: ["settlement"] });
    expect(matches).toHaveLength(1);
  });

  it("should reinforce existing pattern on duplicate add", () => {
    const mem = new PatternMemory();
    const p1 = mem.addPattern({
      description: "test",
      condition: { entityTypes: ["Case"] },
      observation: "same observation",
      confidence: 0.5,
      exampleDecisionId: "d1",
    });

    const p2 = mem.addPattern({
      description: "test",
      condition: { entityTypes: ["Case"] },
      observation: "same observation",
      confidence: 0.5,
      exampleDecisionId: "d2",
    });

    // Should be same pattern, reinforced
    expect(p1.id).toBe(p2.id);
    expect(p1.supportCount).toBe(2);
    expect(p1.confidence).toBeGreaterThan(0.5);
    expect(mem.count).toBe(1);
  });

  it("should filter by confidence threshold", () => {
    const mem = new PatternMemory();
    mem.addPattern({ description: "high", condition: {}, observation: "h", confidence: 0.9, exampleDecisionId: "d1" });
    mem.addPattern({ description: "low", condition: {}, observation: "l", confidence: 0.3, exampleDecisionId: "d2" });

    expect(mem.getHighConfidence(0.7)).toHaveLength(1);
    expect(mem.getAll()).toHaveLength(2);
  });
});

describe("Learning Loop", () => {
  function makeRecord(deviations: Record<string, number>, unexpectedEffects: string[] = []): DecisionRecord {
    return {
      id: "rec_1",
      timestamp: Date.now(),
      worldSnapshot: { timestamp: Date.now(), entitySummaries: [{ id: "e1", type: "Case", keyProperties: {} }], relationCount: 0, entityCount: 1 },
      objectiveSummary: { kpiIds: Object.keys(deviations), kpiValues: Object.fromEntries(Object.keys(deviations).map((k) => [k, 50000])) },
      candidateStrategyIds: ["settlement"],
      candidateScores: { settlement: 0.8 },
      chosenStrategyId: "settlement",
      chosenBy: "auto",
      reasonForChoice: "test",
      outcome: {
        timestamp: Date.now(),
        actualKPIValues: Object.fromEntries(Object.entries(deviations).map(([k, d]) => [k, 50000 * (1 + d)])),
        deviations,
        unexpectedEffects,
      },
    };
  }

  it("should generate confidence_up for accurate predictions", () => {
    const mem = new PatternMemory();
    const record = makeRecord({ recovery: 0.02, cost: -0.01 });

    const updates = learnFromOutcome(record, mem);
    const ups = updates.filter((u) => u.type === "confidence_up");
    expect(ups).toHaveLength(2); // both KPIs accurate
  });

  it("should generate recalibrate for large deviations", () => {
    const mem = new PatternMemory();
    const record = makeRecord({ recovery: 0.25, cost: -0.03 });

    const updates = learnFromOutcome(record, mem);
    const recals = updates.filter((u) => u.type === "recalibrate");
    expect(recals).toHaveLength(1); // only recovery has large deviation
    expect(recals[0].target).toBe("recovery");
  });

  it("should add patterns from unexpected effects", () => {
    const mem = new PatternMemory();
    const record = makeRecord({ recovery: 0.01 }, ["对方律师更换"]);

    const updates = learnFromOutcome(record, mem);
    const suggestions = updates.filter((u) => u.type === "ontology_suggestion");
    expect(suggestions).toHaveLength(1);
    expect(mem.count).toBe(2); // unexpected effect pattern + accurate prediction pattern
  });

  it("should detect systematic bias in history", () => {
    const mem = new PatternMemory();
    // 5 decisions where recovery is consistently over-predicted
    const records: DecisionRecord[] = [];
    for (let i = 0; i < 5; i++) {
      records.push({
        ...makeRecord({ recovery: 0.2 + Math.random() * 0.05 }), // all positive (over-predict)
        id: `rec_${i}`,
        chosenStrategyId: "settlement",
      });
    }

    const updates = analyzeDecisionHistory(records, mem);
    const biasUpdates = updates.filter((u) => u.type === "recalibrate" && u.data.bias);
    expect(biasUpdates.length).toBeGreaterThan(0);
    expect(mem.count).toBeGreaterThan(0);
  });

  it("should not trigger on too few records", () => {
    const mem = new PatternMemory();
    const records = [makeRecord({ recovery: 0.3 })];

    const updates = analyzeDecisionHistory(records, mem);
    expect(updates).toHaveLength(0);
  });
});
