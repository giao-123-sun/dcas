import { describe, it, expect } from "vitest";
import { WorldGraph } from "../../src/world-model/graph.js";
import { evaluateObjective, compareWorlds } from "../../src/objective/objective.js";
import { forkGraph } from "../../src/world-model/fork.js";
import type { ObjectiveSpec } from "../../src/objective/types.js";

function buildLegalWorld() {
  const g = new WorldGraph();
  const caseE = g.addEntity("Case", {
    amount: 80000,
    expected_recovery: 65000,
    expected_cost: 20000,
    duration_months: 3,
  });
  const judge = g.addEntity("Judge", { pro_labor_rate: 0.75 });
  g.addRelation("decided_by", caseE.id, judge.id);
  return { g, caseE, judge };
}

function buildObjective(): ObjectiveSpec {
  return {
    kpis: [
      {
        id: "recovery",
        name: "预期回收",
        direction: "maximize",
        weight: 0.6,
        target: 80000,
        compute: (w) => {
          const cases = w.getEntitiesByType("Case");
          return (cases[0]?.properties.expected_recovery as number) ?? 0;
        },
      },
      {
        id: "cost",
        name: "预期成本",
        direction: "minimize",
        weight: 0.25,
        target: 50000,
        compute: (w) => {
          const cases = w.getEntitiesByType("Case");
          return (cases[0]?.properties.expected_cost as number) ?? 0;
        },
      },
      {
        id: "speed",
        name: "结案速度",
        direction: "minimize",
        weight: 0.15,
        target: 6,
        threshold: 4,
        compute: (w) => {
          const cases = w.getEntitiesByType("Case");
          return (cases[0]?.properties.duration_months as number) ?? 0;
        },
      },
    ],
    constraints: [
      {
        id: "min_recovery",
        description: "回收不低于标的额70%",
        severity: "hard",
        check: (w) => {
          const cases = w.getEntitiesByType("Case");
          const recovery = (cases[0]?.properties.expected_recovery as number) ?? 0;
          const amount = (cases[0]?.properties.amount as number) ?? 1;
          return recovery >= amount * 0.7;
        },
      },
      {
        id: "budget_limit",
        description: "成本不超5万",
        severity: "soft",
        check: (w) => {
          const cases = w.getEntitiesByType("Case");
          return ((cases[0]?.properties.expected_cost as number) ?? 0) <= 50000;
        },
      },
    ],
    tradeoffs: [],
  };
}

describe("Objective Function", () => {
  it("should evaluate KPIs and produce composite score", () => {
    const { g } = buildLegalWorld();
    const spec = buildObjective();
    const result = evaluateObjective(spec, g);

    expect(result.kpiResults).toHaveLength(3);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.hardViolation).toBe(false);

    // recovery: 65000/80000 = 0.8125
    const recovery = result.kpiResults.find((r) => r.kpiId === "recovery")!;
    expect(recovery.normalizedScore).toBeCloseTo(0.8125, 3);
  });

  it("should detect hard constraint violation and zero score", () => {
    const { g, caseE } = buildLegalWorld();
    // Set recovery below 70% of amount (< 56000)
    g.updateProperty(caseE.id, "expected_recovery", 40000);

    const spec = buildObjective();
    const result = evaluateObjective(spec, g);

    expect(result.hardViolation).toBe(true);
    expect(result.score).toBe(0);
  });

  it("should detect soft constraint violation", () => {
    const { g, caseE } = buildLegalWorld();
    g.updateProperty(caseE.id, "expected_cost", 60000);

    const spec = buildObjective();
    const result = evaluateObjective(spec, g);

    expect(result.softViolations).toBe(1);
    // Score still > 0 (soft violation doesn't zero it)
    expect(result.score).toBeGreaterThan(0);
  });

  it("should detect KPI threshold alert", () => {
    const { g, caseE } = buildLegalWorld();
    // duration_months=3, threshold=4, direction=minimize → 3 < 4 → no alert
    const spec = buildObjective();
    let result = evaluateObjective(spec, g);
    expect(result.alerts).toHaveLength(0);

    // Set duration > threshold
    g.updateProperty(caseE.id, "duration_months", 5);
    result = evaluateObjective(spec, g);
    expect(result.alerts).toContain("speed");
  });

  it("should compare two world forks", () => {
    const { g, caseE } = buildLegalWorld();
    const spec = buildObjective();

    const forkSettlement = forkGraph(g, "settlement");
    forkSettlement.updateProperty(caseE.id, "expected_recovery", 62000);
    forkSettlement.updateProperty(caseE.id, "expected_cost", 10000);
    forkSettlement.updateProperty(caseE.id, "duration_months", 1);

    const forkDefense = forkGraph(g, "defense");
    forkDefense.updateProperty(caseE.id, "expected_recovery", 75000);
    forkDefense.updateProperty(caseE.id, "expected_cost", 45000);
    forkDefense.updateProperty(caseE.id, "duration_months", 6);

    const comparison = compareWorlds(spec, forkSettlement, forkDefense);

    // Both should have positive scores
    expect(comparison.resultA.score).toBeGreaterThan(0);
    expect(comparison.resultB.score).toBeGreaterThan(0);

    // Settlement should win (lower cost, faster, decent recovery)
    expect(comparison.delta).toBeGreaterThan(0);
  });

  it("should apply tradeoff adjustments", () => {
    const { g } = buildLegalWorld();
    const spec = buildObjective();

    // Without tradeoff
    const baseline = evaluateObjective(spec, g);

    // Add tradeoff: prefer speed over recovery
    spec.tradeoffs = [
      { kpiA: "speed", kpiB: "recovery", preference: 0.8 },
    ];
    const adjusted = evaluateObjective(spec, g);

    // Speed weight should increase, recovery weight should decrease
    const speedBaseline = baseline.kpiResults.find((r) => r.kpiId === "speed")!;
    const speedAdjusted = adjusted.kpiResults.find((r) => r.kpiId === "speed")!;
    expect(speedAdjusted.weight).toBeGreaterThan(speedBaseline.weight);
  });

  it("should handle minimize direction correctly", () => {
    const { g } = buildLegalWorld();
    const spec = buildObjective();
    const result = evaluateObjective(spec, g);

    // cost: 20000, target: 50000, minimize → score = 1 - 20000/50000 = 0.6
    const cost = result.kpiResults.find((r) => r.kpiId === "cost")!;
    expect(cost.normalizedScore).toBeCloseTo(0.6, 3);

    // speed: 3 months, target: 6, minimize → score = 1 - 3/6 = 0.5
    const speed = result.kpiResults.find((r) => r.kpiId === "speed")!;
    expect(speed.normalizedScore).toBeCloseTo(0.5, 3);
  });
});
