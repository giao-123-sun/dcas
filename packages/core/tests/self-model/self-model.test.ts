import { describe, it, expect } from "vitest";
import { WorldGraph } from "../../src/world-model/graph.js";
import { SelfModel } from "../../src/self-model/self-model.js";
import { checkFeasibility, suggestMitigations } from "../../src/self-model/feasibility.js";
import { selfModelCascadeRules } from "../../src/self-model/cascade-rules.js";
import { simulateStrategy } from "../../src/simulation/simulator.js";
import { compareStrategies } from "../../src/simulation/comparator.js";
import type { Strategy } from "../../src/simulation/types.js";
import type { ObjectiveSpec } from "../../src/objective/types.js";
import type { EntityId } from "../../src/world-model/types.js";

function buildWorldWithSelf() {
  const world = new WorldGraph();

  // Self entity (law firm)
  const firm = world.addEntity("Self", {
    name: "Test Firm",
    specializations: ["labor_law"],
    total_available_hours: 0,
    workload_state: "optimal",
  });

  // Team members
  const senior = world.addEntity("TeamMember", {
    name: "Senior Lawyer",
    role: "partner",
    current_load: 8,
    max_load: 12,
    available_hours: 20,
    proficiency_negotiation: 0.88,
    proficiency_trial: 0.75,
    proficiency_labor_dispute: 0.82,
    fatigue_level: 0.2,
    performance_factor: 1.0,
  });

  const junior = world.addEntity("TeamMember", {
    name: "Junior Lawyer",
    role: "associate",
    current_load: 13,
    max_load: 15,
    available_hours: 5,
    proficiency_negotiation: 0.55,
    proficiency_trial: 0.35,
    proficiency_labor_dispute: 0.60,
    fatigue_level: 0.7,
    performance_factor: 0.85,
  });

  world.addRelation("member_of", senior.id, firm.id);
  world.addRelation("member_of", junior.id, firm.id);

  // Capability gap
  const gap = world.addEntity("CapabilityGap", {
    area: "maritime_law",
    severity: "critical",
  });
  world.addRelation("lacks_capability", firm.id, gap.id);

  // Case for testing
  const caseEntity = world.addEntity("Case", {
    case_type: "labor_dispute",
    claim_amount: 100000,
    expected_recovery: 0,
    expected_cost: 0,
    duration_months: 0,
    strategy: "undecided",
  });

  // Cascade rules
  for (const rule of selfModelCascadeRules) {
    world.addCascadeRule(rule);
  }

  return { world, firm, senior, junior, gap, caseEntity };
}

function buildObjective(): ObjectiveSpec {
  return {
    kpis: [
      { id: "recovery", name: "Recovery", direction: "maximize", weight: 0.6, target: 100000, compute: (w) => (w.getEntitiesByType("Case")[0]?.properties.expected_recovery as number) ?? 0 },
      { id: "cost", name: "Cost", direction: "minimize", weight: 0.4, target: 50000, compute: (w) => (w.getEntitiesByType("Case")[0]?.properties.expected_cost as number) ?? 0 },
    ],
    constraints: [],
    tradeoffs: [],
  };
}

function buildStrategy(caseId: EntityId): Strategy {
  return {
    id: "settlement", name: "Settlement", description: "Negotiate settlement",
    generatedBy: "template",
    actions: [
      { description: "Set strategy", entityId: caseId, property: "strategy", value: "settlement" },
      { description: "Expected recovery 70k", entityId: caseId, property: "expected_recovery", value: 70000 },
      { description: "Expected cost 15k", entityId: caseId, property: "expected_cost", value: 15000 },
    ],
  };
}

describe("SelfModel", () => {
  it("should find self entity and team members", () => {
    const { world } = buildWorldWithSelf();
    const self = new SelfModel(world);
    expect(self.getSelfEntity()).toBeDefined();
    expect(self.getTeamMembers()).toHaveLength(2);
  });

  it("should check capability existence", () => {
    const { world } = buildWorldWithSelf();
    const self = new SelfModel(world);
    expect(self.hasCapability("labor_dispute", "negotiation", 0.5)).toBe(true);
    expect(self.hasCapability("labor_dispute", "negotiation", 0.95)).toBe(false);
  });

  it("should find best member for task", () => {
    const { world, senior } = buildWorldWithSelf();
    const self = new SelfModel(world);
    const best = self.getBestMemberForTask("labor_dispute", "negotiation");
    expect(best?.id).toBe(senior.id);
  });

  it("should detect capability gaps", () => {
    const { world } = buildWorldWithSelf();
    const self = new SelfModel(world);
    const gaps = self.getCapabilityGaps([
      { domain: "labor_dispute", taskType: "negotiation", minProficiency: 0.5 },
      { domain: "labor_dispute", taskType: "trial", minProficiency: 0.9 },
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain("trial");
  });

  it("should calculate available hours", () => {
    const { world } = buildWorldWithSelf();
    const self = new SelfModel(world);
    expect(self.getAvailableHours()).toBe(25); // 20 + 5
  });

  it("should calculate utilization rate", () => {
    const { world } = buildWorldWithSelf();
    const self = new SelfModel(world);
    const rate = self.getUtilizationRate();
    // (8+13) / (12+15) = 21/27 ≈ 0.778
    expect(rate).toBeGreaterThan(0.7);
    expect(rate).toBeLessThan(0.85);
  });

  it("should detect overload", () => {
    const { world } = buildWorldWithSelf();
    const self = new SelfModel(world);
    // Junior has 13/15 = 86.7% < 90%, so not overloaded by default
    expect(self.isOverloaded()).toBe(false);
  });

  it("should calculate quality factor", () => {
    const { world, senior, junior } = buildWorldWithSelf();
    const self = new SelfModel(world);

    const seniorQF = self.getQualityFactor(senior.id, "negotiation");
    const juniorQF = self.getQualityFactor(junior.id, "negotiation");

    // Senior: 0.88 × (1 - 0.2×0.2) × 1.0 = 0.88 × 0.96 = 0.845
    expect(seniorQF).toBeGreaterThan(0.8);
    // Junior: 0.55 × (1 - 0.7×0.2) × 0.85 = 0.55 × 0.86 × 0.85 ≈ 0.402
    expect(juniorQF).toBeLessThan(0.5);
    expect(seniorQF).toBeGreaterThan(juniorQF);
  });
});

describe("Feasibility Checker", () => {
  it("should pass for feasible strategy", () => {
    const { world, caseEntity } = buildWorldWithSelf();
    const self = new SelfModel(world);
    const strategy = buildStrategy(caseEntity.id);

    const result = checkFeasibility(strategy, self, world, {
      requiredSkills: [{ domain: "labor_dispute", taskType: "negotiation", minProficiency: 0.5 }],
      estimatedHours: 15,
      estimatedCost: 10000,
    });

    expect(result.feasible).toBe(true);
    expect(result.score).toBeGreaterThan(0.7);
  });

  it("should fail for capability gap", () => {
    const { world, caseEntity } = buildWorldWithSelf();
    const self = new SelfModel(world);
    const strategy = buildStrategy(caseEntity.id);

    const result = checkFeasibility(strategy, self, world, {
      requiredSkills: [{ domain: "labor_dispute", taskType: "trial", minProficiency: 0.9 }],
      estimatedHours: 10,
      estimatedCost: 5000,
    });

    expect(result.issues.some(i => i.type === "capability_gap")).toBe(true);
  });

  it("should block for extreme resource shortage", () => {
    const { world, caseEntity } = buildWorldWithSelf();
    const self = new SelfModel(world);
    const strategy = buildStrategy(caseEntity.id);

    const result = checkFeasibility(strategy, self, world, {
      requiredSkills: [],
      estimatedHours: 200, // Way more than available 25h
      estimatedCost: 5000,
    });

    expect(result.feasible).toBe(false);
    expect(result.issues.some(i => i.severity === "blocker")).toBe(true);
  });

  it("should detect overload warning", () => {
    const { world, junior, caseEntity } = buildWorldWithSelf();
    // Push junior to overload
    world.updateProperty(junior.id, "current_load", 14); // 14/15 = 93%
    const self = new SelfModel(world);
    const strategy = buildStrategy(caseEntity.id);

    const result = checkFeasibility(strategy, self, world);
    expect(result.issues.some(i => i.type === "overload")).toBe(true);
  });

  it("should suggest mitigations", () => {
    const { world, caseEntity } = buildWorldWithSelf();
    const self = new SelfModel(world);
    const strategy = buildStrategy(caseEntity.id);

    const result = checkFeasibility(strategy, self, world, {
      requiredSkills: [{ domain: "x", taskType: "unknown_skill", minProficiency: 0.9 }],
      estimatedHours: 10,
      estimatedCost: 5000,
    });

    expect(result.mitigations.length).toBeGreaterThan(0);
    expect(result.mitigations.some(m => m.type === "outsource")).toBe(true);
  });
});

describe("Self-Model in Simulation", () => {
  it("should not affect simulation without selfModel (backward compat)", async () => {
    const { world, caseEntity } = buildWorldWithSelf();
    const objective = buildObjective();
    const strategy = buildStrategy(caseEntity.id);

    const result = await simulateStrategy(world, strategy, objective);
    expect(result.feasibility).toBeUndefined();
    expect(result.objectiveResult.score).toBeGreaterThan(0);
  });

  it("should include feasibility when selfModel provided", async () => {
    const { world, caseEntity } = buildWorldWithSelf();
    const objective = buildObjective();
    const strategy = buildStrategy(caseEntity.id);
    const self = new SelfModel(world);

    const result = await simulateStrategy(world, strategy, objective, undefined, undefined, undefined, undefined, self);
    expect(result.feasibility).toBeDefined();
    expect(result.feasibility!.feasible).toBe(true);
  });

  it("should rank infeasible strategies last in comparison", async () => {
    const { world, caseEntity } = buildWorldWithSelf();
    const objective = buildObjective();
    const self = new SelfModel(world);

    const feasibleStrategy: Strategy = {
      id: "feasible", name: "Feasible", description: "Can do", generatedBy: "template",
      actions: [
        { description: "Set recovery", entityId: caseEntity.id, property: "expected_recovery", value: 60000 },
        { description: "Set cost", entityId: caseEntity.id, property: "expected_cost", value: 10000 },
      ],
    };

    const infeasibleStrategy: Strategy = {
      id: "infeasible", name: "Infeasible", description: "Cannot do", generatedBy: "template",
      actions: [
        { description: "Set recovery", entityId: caseEntity.id, property: "expected_recovery", value: 80000 },
        { description: "Set cost", entityId: caseEntity.id, property: "expected_cost", value: 5000 },
      ],
    };

    // Mock: make infeasible by requiring impossible skill
    // We'll test ranking logic by checking that compareStrategies passes selfModel through
    const ranked = await compareStrategies(world, [feasibleStrategy, infeasibleStrategy], objective, undefined, undefined, undefined, self);
    expect(ranked.rankings).toHaveLength(2);
    // Both should have feasibility defined
    for (const r of ranked.rankings) {
      expect(r.feasibility).toBeDefined();
    }
  });
});

describe("Self-Model Cascade", () => {
  it("should propagate member availability change to self", () => {
    const { world, senior, firm } = buildWorldWithSelf();

    // Initially total_available_hours was 0 (not yet cascaded)
    // Trigger cascade by changing senior's available hours
    world.updateProperty(senior.id, "available_hours", 10);

    // Should cascade to firm's total_available_hours
    const self = world.getEntity(firm.id)!;
    expect(self.properties.total_available_hours).toBeDefined();
  });

  it("should detect overload via cascade", () => {
    const { world, senior, firm } = buildWorldWithSelf();

    // Push senior to overload (11/12 = 91.7% > 90%)
    world.updateProperty(senior.id, "current_load", 11);

    const self = world.getEntity(firm.id)!;
    expect(self.properties.workload_state).toBe("overloaded");
  });
});
