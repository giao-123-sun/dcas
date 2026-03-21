import { describe, it, expect } from "vitest";
import { WorldGraph } from "../../src/world-model/graph.js";
import { simulateStrategy } from "../../src/simulation/simulator.js";
import { compareStrategies } from "../../src/simulation/comparator.js";
import { PredictionEngine } from "../../src/prediction/engine.js";
import { HeuristicModel } from "../../src/prediction/models/heuristic.js";
import type { Strategy } from "../../src/simulation/types.js";
import type { ObjectiveSpec } from "../../src/objective/types.js";
import type { CascadeRule } from "../../src/world-model/types.js";

// ============================================================
// Shared test fixtures: a legal case world
// ============================================================

function buildLegalWorld() {
  const g = new WorldGraph();

  const caseE = g.addEntity("Case", {
    strategy: "undecided",
    expected_recovery: 0,
    expected_cost: 0,
    duration_months: 0,
    amount: 80000,
    evidence_strength: 7.2,
  });

  const budget = g.addEntity("Budget", { allocated: 0 });
  const judge = g.addEntity("Judge", { name: "王法官", pro_labor_rate: 0.75 });

  g.addRelation("has_budget", caseE.id, budget.id);
  g.addRelation("decided_by", caseE.id, judge.id);

  // Cascade: when strategy changes, update budget
  const rule: CascadeRule = {
    sourceType: "Case",
    sourceProperty: "expected_cost",
    relationTypes: ["has_budget"],
    direction: "outgoing",
    maxDepth: 2,
    effect: (ctx) => ({
      targetProperty: "allocated",
      value: ctx.newValue,
    }),
  };
  g.addCascadeRule(rule);

  return { g, caseE, budget, judge };
}

function buildObjective(): ObjectiveSpec {
  return {
    kpis: [
      {
        id: "recovery",
        name: "预期回收",
        direction: "maximize",
        weight: 0.5,
        target: 80000,
        compute: (w) => {
          const c = w.getEntitiesByType("Case")[0];
          return (c?.properties.expected_recovery as number) ?? 0;
        },
      },
      {
        id: "cost",
        name: "预期成本",
        direction: "minimize",
        weight: 0.3,
        target: 50000,
        compute: (w) => {
          const c = w.getEntitiesByType("Case")[0];
          return (c?.properties.expected_cost as number) ?? 0;
        },
      },
      {
        id: "speed",
        name: "结案速度",
        direction: "minimize",
        weight: 0.2,
        target: 6,
        compute: (w) => {
          const c = w.getEntitiesByType("Case")[0];
          return (c?.properties.duration_months as number) ?? 0;
        },
      },
    ],
    constraints: [
      {
        id: "min_recovery",
        description: "回收不低于标的额50%",
        severity: "hard",
        check: (w) => {
          const c = w.getEntitiesByType("Case")[0];
          const recovery = (c?.properties.expected_recovery as number) ?? 0;
          const amount = (c?.properties.amount as number) ?? 1;
          return recovery >= amount * 0.5;
        },
      },
    ],
    tradeoffs: [],
  };
}

function buildStrategies(caseId: string): Strategy[] {
  return [
    {
      id: "settlement",
      name: "和解谈判",
      description: "通过谈判达成和解",
      generatedBy: "template",
      actions: [
        { description: "设定策略为和解", entityId: caseId as any, property: "strategy", value: "settlement" },
        { description: "预期回收6.5万", entityId: caseId as any, property: "expected_recovery", value: 65000 },
        { description: "预期成本1万", entityId: caseId as any, property: "expected_cost", value: 10000 },
        { description: "预期1个月结案", entityId: caseId as any, property: "duration_months", value: 1 },
      ],
    },
    {
      id: "full_defense",
      name: "全面抗辩",
      description: "进入正式仲裁程序",
      generatedBy: "template",
      actions: [
        { description: "设定策略为抗辩", entityId: caseId as any, property: "strategy", value: "full_defense" },
        { description: "预期回收4万", entityId: caseId as any, property: "expected_recovery", value: 40000 },
        { description: "预期成本4.5万", entityId: caseId as any, property: "expected_cost", value: 45000 },
        { description: "预期5个月结案", entityId: caseId as any, property: "duration_months", value: 5 },
      ],
    },
    {
      id: "jurisdiction",
      name: "管辖权异议",
      description: "提出管辖权异议换法院",
      generatedBy: "template",
      actions: [
        { description: "设定策略为异议", entityId: caseId as any, property: "strategy", value: "jurisdiction" },
        { description: "预期回收5.5万", entityId: caseId as any, property: "expected_recovery", value: 55000 },
        { description: "预期成本2.5万", entityId: caseId as any, property: "expected_cost", value: 25000 },
        { description: "预期3个月结案", entityId: caseId as any, property: "duration_months", value: 3 },
      ],
    },
  ];
}

// ============================================================
// Tests
// ============================================================

describe("simulateStrategy", () => {
  it("should apply actions and return diffs", () => {
    const { g, caseE } = buildLegalWorld();
    const objective = buildObjective();
    const strategy = buildStrategies(caseE.id)[0]; // settlement

    const result = simulateStrategy(g, strategy, objective);

    expect(result.strategyId).toBe("settlement");
    expect(result.diffs.length).toBeGreaterThan(0);
    // Original world should be unchanged
    expect(g.getEntity(caseE.id)!.properties.strategy).toBe("undecided");
    // Forked world should have the strategy applied
    expect(result.forkedWorld.getEntity(caseE.id)!.properties.strategy).toBe("settlement");
  });

  it("should evaluate objective after simulation", () => {
    const { g, caseE } = buildLegalWorld();
    const objective = buildObjective();
    const strategy = buildStrategies(caseE.id)[0];

    const result = simulateStrategy(g, strategy, objective);

    expect(result.objectiveResult.score).toBeGreaterThan(0);
    expect(result.objectiveResult.hardViolation).toBe(false);
    expect(result.objectiveResult.kpiResults).toHaveLength(3);
  });

  it("should trigger cascade during simulation", () => {
    const { g, caseE } = buildLegalWorld();
    const objective = buildObjective();
    const strategy = buildStrategies(caseE.id)[0]; // settlement, cost=10000

    const result = simulateStrategy(g, strategy, objective);

    // Budget.allocated should cascade from expected_cost
    const budget = result.forkedWorld.getEntitiesByType("Budget")[0];
    expect(budget.properties.allocated).toBe(10000);
  });

  it("should produce reasoning chain", () => {
    const { g, caseE } = buildLegalWorld();
    const objective = buildObjective();
    const strategy = buildStrategies(caseE.id)[0];

    const result = simulateStrategy(g, strategy, objective);

    expect(result.reasoningChain.length).toBeGreaterThan(0);
    expect(result.reasoningChain[0]).toContain("和解谈判");
    // Last entry should have score
    const last = result.reasoningChain[result.reasoningChain.length - 1];
    expect(last).toContain("最终得分");
  });

  it("should produce risk profile", () => {
    const { g, caseE } = buildLegalWorld();
    const objective = buildObjective();
    const strategy = buildStrategies(caseE.id)[0];

    const result = simulateStrategy(g, strategy, objective);

    expect(result.riskProfile.expectedCase).toBeGreaterThan(0);
    expect(result.riskProfile.bestCase).toBeGreaterThanOrEqual(result.riskProfile.expectedCase);
    expect(result.riskProfile.worstCase).toBeLessThanOrEqual(result.riskProfile.expectedCase);
  });

  it("should handle conditional actions", () => {
    const { g, caseE } = buildLegalWorld();
    const objective = buildObjective();

    const strategy: Strategy = {
      id: "conditional_test",
      name: "条件测试",
      description: "测试条件触发",
      generatedBy: "manual",
      actions: [
        { description: "设定高回收", entityId: caseE.id, property: "expected_recovery", value: 70000 },
        { description: "设定成本", entityId: caseE.id, property: "expected_cost", value: 15000 },
      ],
      conditionals: [
        {
          description: "如果回收>60000则加速结案",
          condition: (w) => {
            const c = w.getEntitiesByType("Case")[0];
            return ((c?.properties.expected_recovery as number) ?? 0) > 60000;
          },
          action: {
            description: "设定1个月结案",
            entityId: caseE.id,
            property: "duration_months",
            value: 1,
          },
        },
      ],
    };

    const result = simulateStrategy(g, strategy, objective);
    const forkedCase = result.forkedWorld.getEntity(caseE.id)!;
    expect(forkedCase.properties.duration_months).toBe(1);
    expect(result.reasoningChain.some((r) => r.includes("条件触发"))).toBe(true);
  });

  it("should work with prediction engine", () => {
    const { g, caseE } = buildLegalWorld();
    const objective = buildObjective();
    const strategy = buildStrategies(caseE.id)[0];

    const engine = new PredictionEngine();
    engine.registerModel(
      new HeuristicModel("h_recovery", "expected_recovery", [], {
        mean: 62000,
        std: 8000,
        confidence: 0.7,
      }),
    );

    const result = simulateStrategy(g, strategy, objective, engine, ["expected_recovery"]);

    // Should have step predictions
    expect(result.stepPredictions.length).toBe(strategy.actions.length);
  });
});

describe("compareStrategies", () => {
  it("should rank strategies by objective score", () => {
    const { g, caseE } = buildLegalWorld();
    const objective = buildObjective();
    const strategies = buildStrategies(caseE.id);

    const ranked = compareStrategies(g, strategies, objective);

    expect(ranked.rankings).toHaveLength(3);
    expect(ranked.rankings[0].rank).toBe(1);
    expect(ranked.rankings[1].rank).toBe(2);
    expect(ranked.rankings[2].rank).toBe(3);

    // Scores should be descending
    expect(ranked.rankings[0].score).toBeGreaterThanOrEqual(ranked.rankings[1].score);
    expect(ranked.rankings[1].score).toBeGreaterThanOrEqual(ranked.rankings[2].score);
  });

  it("should rank settlement first (best composite score)", () => {
    const { g, caseE } = buildLegalWorld();
    const objective = buildObjective();
    const strategies = buildStrategies(caseE.id);

    const ranked = compareStrategies(g, strategies, objective);

    // Settlement: high recovery (65k), low cost (10k), fast (1mo) → should be #1
    expect(ranked.rankings[0].strategyName).toBe("和解谈判");
  });

  it("should push hard-violation strategies to bottom", () => {
    const { g, caseE } = buildLegalWorld();
    const objective = buildObjective();

    const strategies: Strategy[] = [
      {
        id: "bad",
        name: "极差策略",
        description: "回收太低违反硬约束",
        generatedBy: "manual",
        actions: [
          { description: "极低回收", entityId: caseE.id, property: "expected_recovery", value: 10000 },
          { description: "成本", entityId: caseE.id, property: "expected_cost", value: 5000 },
          { description: "速度", entityId: caseE.id, property: "duration_months", value: 1 },
        ],
      },
      ...buildStrategies(caseE.id).slice(0, 1), // settlement
    ];

    const ranked = compareStrategies(g, strategies, objective);

    // Bad strategy violates hard constraint (recovery 10k < 40k = 50% of 80k)
    expect(ranked.rankings[ranked.rankings.length - 1].strategyName).toBe("极差策略");
    expect(ranked.rankings[ranked.rankings.length - 1].score).toBe(0);
  });

  it("should produce reasoning for each strategy", () => {
    const { g, caseE } = buildLegalWorld();
    const objective = buildObjective();
    const strategies = buildStrategies(caseE.id);

    const ranked = compareStrategies(g, strategies, objective);

    for (const r of ranked.rankings) {
      expect(r.reasoning.length).toBeGreaterThan(0);
    }
    // Top strategy reasoning should mention "综合得分最高"
    expect(ranked.rankings[0].reasoning).toContain("综合得分最高");
  });

  it("should not modify the original world", () => {
    const { g, caseE } = buildLegalWorld();
    const objective = buildObjective();
    const strategies = buildStrategies(caseE.id);

    compareStrategies(g, strategies, objective);

    // Original world untouched
    expect(g.getEntity(caseE.id)!.properties.strategy).toBe("undecided");
    expect(g.getEntity(caseE.id)!.properties.expected_recovery).toBe(0);
  });
});
