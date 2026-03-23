import { describe, it, expect } from "vitest";
import { WorldGraph } from "../../src/world-model/graph.js";
import { simulateStrategy } from "../../src/simulation/simulator.js";
import { compareStrategies } from "../../src/simulation/comparator.js";
import { translateToSkill, validateSkill } from "../../src/metaclaw/translator.js";
import { SkillManager } from "../../src/metaclaw/skill-manager.js";
import type { SkillFileSystem } from "../../src/metaclaw/skill-manager.js";
import { processFeedback } from "../../src/metaclaw/feedback.js";
import type { Strategy } from "../../src/simulation/types.js";
import type { ObjectiveSpec } from "../../src/objective/types.js";
import type { MetaClawFeedback, MetaClawSkill } from "../../src/metaclaw/types.js";
import { serializeWorldForLLM } from "../../src/llm/world-serializer.js";

// ============================================================
// Test fixtures
// ============================================================

function buildTestWorld() {
  const g = new WorldGraph();
  const caseE = g.addEntity("Case", {
    strategy: "undecided",
    expected_recovery: 0,
    expected_cost: 0,
    duration_months: 0,
    amount: 80000,
  });
  const judge = g.addEntity("Judge", { name: "王法官", pro_labor_rate: 0.75 });
  g.addRelation("decided_by", caseE.id, judge.id);
  return { g, caseE, judge };
}

function buildObjective(): ObjectiveSpec {
  return {
    kpis: [
      {
        id: "recovery", name: "预期回收", direction: "maximize", weight: 0.6, target: 80000,
        compute: (w) => (w.getEntitiesByType("Case")[0]?.properties.expected_recovery as number) ?? 0,
      },
      {
        id: "cost", name: "预期成本", direction: "minimize", weight: 0.25, target: 50000,
        compute: (w) => (w.getEntitiesByType("Case")[0]?.properties.expected_cost as number) ?? 0,
      },
      {
        id: "speed", name: "结案速度", direction: "minimize", weight: 0.15, target: 6,
        compute: (w) => (w.getEntitiesByType("Case")[0]?.properties.duration_months as number) ?? 0,
      },
    ],
    constraints: [
      {
        id: "min_recovery", description: "回收不低于50%", severity: "hard",
        check: (w) => {
          const c = w.getEntitiesByType("Case")[0];
          return ((c?.properties.expected_recovery as number) ?? 0) >= ((c?.properties.amount as number) ?? 1) * 0.5;
        },
      },
    ],
    tradeoffs: [],
  };
}

function buildStrategy(caseId: string): Strategy {
  return {
    id: "settlement", name: "和解谈判", description: "通过谈判达成和解", generatedBy: "template",
    actions: [
      { description: "设定策略", entityId: caseId as any, property: "strategy", value: "settlement" },
      { description: "预期回收", entityId: caseId as any, property: "expected_recovery", value: 65000 },
      { description: "预期成本", entityId: caseId as any, property: "expected_cost", value: 10000 },
      { description: "预期时长", entityId: caseId as any, property: "duration_months", value: 1 },
    ],
  };
}

// In-memory FS mock
function createMockFS(): SkillFileSystem {
  const store = new Map<string, string>();
  return {
    async readJSON<T>(path: string): Promise<T | null> {
      const data = store.get(path);
      return data ? JSON.parse(data) : null;
    },
    async writeJSON(path: string, data: unknown): Promise<void> {
      store.set(path, JSON.stringify(data));
    },
    async exists(path: string): Promise<boolean> {
      return store.has(path);
    },
    async mkdir(_path: string): Promise<void> { /* noop */ },
    async list(dir: string): Promise<string[]> {
      return [...store.keys()]
        .filter((k) => k.startsWith(dir + "/"))
        .map((k) => k.slice(dir.length + 1));
    },
    async remove(path: string): Promise<void> {
      store.delete(path);
    },
  };
}

// ============================================================
// Tests
// ============================================================

describe("World Serializer", () => {
  it("should serialize world state to readable text", () => {
    const { g } = buildTestWorld();
    const text = serializeWorldForLLM(g);

    expect(text).toContain("## 世界状态");
    expect(text).toContain("Case");
    expect(text).toContain("Judge");
    expect(text).toContain("decided_by");
    expect(text).toContain("80000");
  });
});

describe("Strategy-to-Skill Translator", () => {
  it("should translate simulation result to valid MetaClaw Skill", async () => {
    const { g, caseE } = buildTestWorld();
    const objective = buildObjective();
    const strategy = buildStrategy(caseE.id);

    const simulation = await simulateStrategy(g, strategy, objective);
    const ranked = await compareStrategies(g, [strategy], objective);

    const skill = await translateToSkill({
      simulation,
      ranking: ranked.rankings[0],
      objective,
      world: g,
      domainContext: "法律案件策略",
    });

    expect(skill.name).toContain("dcas_settlement");
    expect(skill.source).toBe("dcas");
    expect(skill.tags).toContain("dcas");
    expect(skill.dcas_metadata).toBeDefined();
    expect(skill.dcas_metadata!.strategy_id).toBeDefined();
    expect(skill.instruction).toContain("## 目标");
    expect(skill.instruction).toContain("## 策略");
    expect(skill.instruction).toContain("## 约束");
    expect(skill.instruction).toContain("## 上下文");
  });

  it("should pass validation", async () => {
    const { g, caseE } = buildTestWorld();
    const objective = buildObjective();
    const strategy = buildStrategy(caseE.id);

    const simulation = await simulateStrategy(g, strategy, objective);
    const ranked = await compareStrategies(g, [strategy], objective);

    const skill = await translateToSkill({
      simulation,
      ranking: ranked.rankings[0],
      objective,
      world: g,
      domainContext: "法律案件策略",
    });

    const validation = validateSkill(skill);
    expect(validation.valid).toBe(true);
    expect(validation.failures).toHaveLength(0);
  });

  it("should set priority based on ranking", async () => {
    const { g, caseE } = buildTestWorld();
    const objective = buildObjective();
    const strategies = [
      buildStrategy(caseE.id),
      { ...buildStrategy(caseE.id), id: "defense", name: "抗辩" },
      { ...buildStrategy(caseE.id), id: "jurisdiction", name: "异议" },
    ];

    const ranked = await compareStrategies(g, strategies, objective);

    const skill1 = await translateToSkill({
      simulation: await simulateStrategy(g, strategies[0], objective),
      ranking: ranked.rankings[0],
      objective, world: g, domainContext: "",
    });
    expect(skill1.priority).toBe("high");

    const skill3 = await translateToSkill({
      simulation: await simulateStrategy(g, strategies[2], objective),
      ranking: ranked.rankings[2],
      objective, world: g, domainContext: "",
    });
    expect(skill3.priority).toBe("low");
  });
});

describe("SkillManager", () => {
  it("should initialize directory structure", async () => {
    const fs = createMockFS();
    const manager = new SkillManager(fs, "/skills/dcas");
    await manager.initialize();

    const index = await manager.getIndex();
    expect(index.skills).toHaveLength(0);
  });

  it("should deploy and retrieve a skill", async () => {
    const fs = createMockFS();
    const manager = new SkillManager(fs, "/skills/dcas");
    await manager.initialize();

    const skill: MetaClawSkill = {
      name: "dcas_settlement_v1",
      instruction: "test instruction",
      tags: ["dcas"],
      created_at: new Date().toISOString(),
      source: "dcas",
      priority: "high",
      dcas_metadata: {
        strategy_id: "strat_1",
        objective: { primary_kpi: "recovery", direction: "maximize", confidence: 0.7 },
        world_context: { key_entities: [], risk_level: "medium" },
        version: 1,
      },
    };

    await manager.deploySkill(skill);

    const retrieved = await manager.getActiveSkill("dcas_settlement_v1");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toBe("dcas_settlement_v1");

    const index = await manager.getIndex();
    expect(index.skills).toHaveLength(1);
    expect(index.skills[0].status).toBe("active");
  });

  it("should archive old version when deploying new", async () => {
    const fs = createMockFS();
    const manager = new SkillManager(fs, "/skills/dcas");
    await manager.initialize();

    const v1: MetaClawSkill = {
      name: "dcas_settlement_v1",
      instruction: "v1 instruction",
      tags: ["dcas"],
      created_at: new Date().toISOString(),
      source: "dcas",
      dcas_metadata: {
        strategy_id: "strat_1",
        objective: { primary_kpi: "recovery", direction: "maximize", confidence: 0.7 },
        world_context: { key_entities: [], risk_level: "medium" },
        version: 1,
      },
    };
    await manager.deploySkill(v1);

    const v2: MetaClawSkill = {
      ...v1,
      name: "dcas_settlement_v2",
      instruction: "v2 instruction",
      dcas_metadata: { ...v1.dcas_metadata!, version: 2, supersedes: "dcas_settlement_v1" },
    };
    await manager.deploySkill(v2);

    // v1 should be archived
    expect(await manager.getActiveSkill("dcas_settlement_v1")).toBeNull();
    // v2 should be active
    expect(await manager.getActiveSkill("dcas_settlement_v2")).not.toBeNull();
  });

  it("should record feedback and update stats", async () => {
    const fs = createMockFS();
    const manager = new SkillManager(fs, "/skills/dcas");
    await manager.initialize();

    const skill: MetaClawSkill = {
      name: "dcas_test_v1",
      instruction: "test",
      tags: ["dcas"],
      created_at: new Date().toISOString(),
      source: "dcas",
      dcas_metadata: {
        strategy_id: "s1",
        objective: { primary_kpi: "x", direction: "maximize", confidence: 0.5 },
        world_context: { key_entities: [], risk_level: "low" },
        version: 1,
      },
    };
    await manager.deploySkill(skill);

    await manager.recordFeedback("dcas_test", 0.85);
    await manager.recordFeedback("dcas_test", 0.90);

    const index = await manager.getIndex();
    const entry = index.skills[0];
    expect(entry.total_uses).toBe(2);
    expect(entry.feedback_count).toBe(2);
    expect(entry.avg_execution_reward).toBeGreaterThan(0);
  });

  it("should list active skills", async () => {
    const fs = createMockFS();
    const manager = new SkillManager(fs, "/skills/dcas");
    await manager.initialize();

    const makeSkill = (name: string): MetaClawSkill => ({
      name, instruction: "x", tags: ["dcas"],
      created_at: new Date().toISOString(), source: "dcas",
      dcas_metadata: {
        strategy_id: "s",
        objective: { primary_kpi: "x", direction: "maximize", confidence: 0.5 },
        world_context: { key_entities: [], risk_level: "low" },
        version: 1,
      },
    });

    await manager.deploySkill(makeSkill("skill_a_v1"));
    await manager.deploySkill(makeSkill("skill_b_v1"));

    const active = await manager.listActiveSkills();
    expect(active).toHaveLength(2);
    expect(active).toContain("skill_a_v1");
    expect(active).toContain("skill_b_v1");
  });
});

describe("Feedback Processor", () => {
  it("should extract recalibration signal from prediction deviation", () => {
    const feedback: MetaClawFeedback = {
      feedback_id: "fb_1",
      session_id: "sess_1",
      timestamp: new Date().toISOString(),
      dcas_strategy_id: "strat_1",
      execution_summary: { total_turns: 10, avg_reward: 0.78, completion_status: "success", duration_seconds: 600 },
      outcome: { achieved: true, actual_value: 62000, predicted_value: 65000, deviation: -0.046 },
      new_skills_generated: [],
      anomalies: [],
    };

    const signals = processFeedback(feedback);
    // Deviation is only 4.6%, below 10% threshold → no recalibration signal
    expect(signals.filter((s) => s.type === "recalibrate")).toHaveLength(0);
  });

  it("should trigger recalibration on large deviation", () => {
    const feedback: MetaClawFeedback = {
      feedback_id: "fb_2",
      session_id: "sess_2",
      timestamp: new Date().toISOString(),
      dcas_strategy_id: "strat_1",
      execution_summary: { total_turns: 8, avg_reward: 0.65, completion_status: "success", duration_seconds: 900 },
      outcome: { achieved: true, actual_value: 40000, predicted_value: 65000, deviation: -0.385 },
      new_skills_generated: [],
      anomalies: [],
    };

    const signals = processFeedback(feedback);
    const recal = signals.filter((s) => s.type === "recalibrate");
    expect(recal).toHaveLength(1);
    // deviation is negative (actual < predicted) → model over-predicted → direction is "under_predicted" (actual undershot)
    expect(recal[0].data.direction).toBe("under_predicted");
  });

  it("should extract ontology suggestions from new skills", () => {
    const feedback: MetaClawFeedback = {
      feedback_id: "fb_3",
      session_id: "sess_3",
      timestamp: new Date().toISOString(),
      dcas_strategy_id: "strat_1",
      execution_summary: { total_turns: 12, avg_reward: 0.82, completion_status: "success", duration_seconds: 1200 },
      outcome: { achieved: true, actual_value: 63000, predicted_value: 65000, deviation: -0.031 },
      new_skills_generated: [
        { name: "empathy_before_counter", instruction: "先共情再反驳", source: "auto_evolve" },
      ],
      anomalies: [
        { type: "faster_than_expected", description: "预计3轮实际2轮", possible_cause: "对方急于结案" },
      ],
    };

    const signals = processFeedback(feedback);
    expect(signals.filter((s) => s.type === "ontology_suggestion")).toHaveLength(1);
    expect(signals.filter((s) => s.type === "pattern")).toHaveLength(1);
  });

  it("should flag low execution quality", () => {
    const feedback: MetaClawFeedback = {
      feedback_id: "fb_4",
      session_id: "sess_4",
      timestamp: new Date().toISOString(),
      dcas_strategy_id: "strat_1",
      execution_summary: { total_turns: 15, avg_reward: 0.35, completion_status: "failed", duration_seconds: 1800 },
      new_skills_generated: [],
      anomalies: [],
    };

    const signals = processFeedback(feedback);
    const quality = signals.filter((s) => s.type === "pattern" && s.description.includes("执行质量"));
    expect(quality).toHaveLength(1);
  });
});
