import { describe, it, expect } from "vitest";
import { WorldGraph } from "../../src/world-model/graph.js";
import { DecisionLoopController } from "../../src/loop/controller.js";
import { DecisionStore } from "../../src/memory/decision-store.js";
import type { ObjectiveSpec } from "../../src/objective/types.js";
import type { Strategy } from "../../src/simulation/types.js";

function buildWorld() {
  const g = new WorldGraph();
  const caseE = g.addEntity("Case", {
    expected_recovery: 50000,
    expected_cost: 30000,
    duration_months: 4,
    amount: 80000,
  });
  return { g, caseE };
}

function buildObjective(): ObjectiveSpec {
  return {
    kpis: [
      {
        id: "recovery", name: "回收", direction: "maximize", weight: 0.6, target: 80000,
        threshold: 40000, // alert if below 40k
        compute: (w) => (w.getEntitiesByType("Case")[0]?.properties.expected_recovery as number) ?? 0,
      },
      {
        id: "cost", name: "成本", direction: "minimize", weight: 0.4, target: 50000,
        threshold: 40000, // alert if above 40k
        compute: (w) => (w.getEntitiesByType("Case")[0]?.properties.expected_cost as number) ?? 0,
      },
    ],
    constraints: [],
    tradeoffs: [],
  };
}

function buildStrategyGen(caseId: string): () => Strategy[] {
  return () => [
    {
      id: "adjust", name: "调整策略", description: "调整", generatedBy: "template" as const,
      actions: [
        { description: "调整回收", entityId: caseId as any, property: "expected_recovery", value: 60000 },
        { description: "调整成本", entityId: caseId as any, property: "expected_cost", value: 15000 },
      ],
    },
  ];
}

describe("DecisionLoopController", () => {
  it("should detect KPI alerts", () => {
    const { g, caseE } = buildWorld();
    const objective = buildObjective();

    // recovery=50000 > threshold 40000 → no alert
    // cost=30000 < threshold 40000 → no alert
    const controller = new DecisionLoopController(g, objective, () => []);
    let alerts = controller.checkKPIs();
    expect(alerts).toHaveLength(0);

    // Drop recovery below threshold
    g.updateProperty(caseE.id, "expected_recovery", 35000);
    alerts = controller.checkKPIs();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kpiId).toBe("recovery");
    expect(alerts[0].severity).toBe("warning");
  });

  it("should run cycle and recommend when alerts exist", async () => {
    const { g, caseE } = buildWorld();
    const objective = buildObjective();
    g.updateProperty(caseE.id, "expected_recovery", 35000); // trigger alert

    const controller = new DecisionLoopController(
      g, objective, buildStrategyGen(caseE.id),
      { mode: "monitoring" },
    );

    const action = await controller.runCycle();
    expect(action).not.toBeNull();
    expect(action!.type).toBe("recommend");
    expect(action!.alerts).toHaveLength(1);
    expect(action!.rankings.rankings.length).toBeGreaterThan(0);
  });

  it("should return null when no alerts in monitoring mode", async () => {
    const { g, caseE } = buildWorld();
    const objective = buildObjective();
    // No KPI breaches

    const controller = new DecisionLoopController(
      g, objective, buildStrategyGen(caseE.id),
      { mode: "monitoring" },
    );

    const action = await controller.runCycle();
    expect(action).toBeNull();
  });

  it("should always run in reactive mode", async () => {
    const { g, caseE } = buildWorld();
    const objective = buildObjective();

    const controller = new DecisionLoopController(
      g, objective, buildStrategyGen(caseE.id),
      { mode: "reactive" },
    );

    // Even without alerts, reactive mode runs when triggered
    const action = await controller.runCycle();
    expect(action).not.toBeNull();
    expect(action!.type).toBe("recommend");
  });

  it("should auto-execute in autonomous mode when confidence is high", async () => {
    const { g, caseE } = buildWorld();
    const objective = buildObjective();
    g.updateProperty(caseE.id, "expected_recovery", 35000);

    const controller = new DecisionLoopController(
      g, objective, buildStrategyGen(caseE.id),
      {
        mode: "autonomous",
        autoConfidenceThreshold: 0.1, // very low threshold for test
        autoWorstCaseFloor: 0,
      },
    );

    const action = await controller.runCycle();
    expect(action).not.toBeNull();
    expect(action!.type).toBe("auto_execute");
  });

  it("should record decisions to store", async () => {
    const { g, caseE } = buildWorld();
    const objective = buildObjective();
    g.updateProperty(caseE.id, "expected_recovery", 35000);

    const store = new DecisionStore();
    const controller = new DecisionLoopController(
      g, objective, buildStrategyGen(caseE.id),
      { mode: "monitoring" },
      undefined,
      store,
    );

    await controller.runCycle();
    expect(store.count).toBe(1);
  });

  it("should support mode switching", () => {
    const { g, caseE } = buildWorld();
    const objective = buildObjective();

    const controller = new DecisionLoopController(
      g, objective, () => [],
      { mode: "monitoring" },
    );

    expect(controller.mode).toBe("monitoring");
    controller.setMode("autonomous");
    expect(controller.mode).toBe("autonomous");
  });

  it("should start and stop", () => {
    const { g, caseE } = buildWorld();
    const objective = buildObjective();

    const controller = new DecisionLoopController(
      g, objective, () => [],
      { mode: "monitoring", checkIntervalMs: 100000 },
    );

    controller.start();
    expect(controller.isRunning).toBe(true);
    controller.stop();
    expect(controller.isRunning).toBe(false);
  });

  it("should handle double start() without timer leak", () => {
    const { g, caseE } = buildWorld();
    const objective = buildObjective();
    const controller = new DecisionLoopController(
      g, objective, () => [],
      { mode: "monitoring", checkIntervalMs: 100000 },
    );
    controller.start();
    controller.start(); // double start
    expect(controller.isRunning).toBe(true);
    controller.stop();
    expect(controller.isRunning).toBe(false);
  });
});
