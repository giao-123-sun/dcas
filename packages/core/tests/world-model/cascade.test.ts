import { describe, it, expect } from "vitest";
import { WorldGraph } from "../../src/world-model/graph.js";
import type { CascadeRule } from "../../src/world-model/types.js";

describe("Cascade Engine", () => {
  it("should propagate single-hop cascade", () => {
    const g = new WorldGraph();
    const caseE = g.addEntity("Case", { strategy: "defense", expected_cost: 50000 });
    const budget = g.addEntity("Budget", { allocated: 50000 });
    g.addRelation("has_budget", caseE.id, budget.id);

    const rule: CascadeRule = {
      sourceType: "Case",
      sourceProperty: "strategy",
      relationTypes: ["has_budget"],
      direction: "outgoing",
      maxDepth: 3,
      effect: (ctx) => {
        if (ctx.newValue === "settlement") {
          return { targetProperty: "allocated", value: 30000 };
        }
        if (ctx.newValue === "full_litigation") {
          return { targetProperty: "allocated", value: 80000 };
        }
        return undefined;
      },
    };
    g.addCascadeRule(rule);

    const result = g.updateProperty(caseE.id, "strategy", "settlement");
    expect(result.diffs).toHaveLength(2); // 1 direct + 1 cascade
    expect(result.cascadeCount).toBe(1);
    expect(budget.properties.allocated).toBe(30000);

    const cascadeDiff = result.diffs[1];
    expect(cascadeDiff.cause).toBe("cascade");
    expect(cascadeDiff.depth).toBe(1);
    expect(cascadeDiff.oldValue).toBe(50000);
    expect(cascadeDiff.newValue).toBe(30000);
  });

  it("should propagate multi-hop cascade", () => {
    const g = new WorldGraph();
    const a = g.addEntity("Type1", { score: 10 });
    const b = g.addEntity("Type1", { score: 0 });
    const c = g.addEntity("Type1", { score: 0 });
    g.addRelation("link", a.id, b.id);
    g.addRelation("link", b.id, c.id);

    const rule: CascadeRule = {
      sourceType: "Type1",
      sourceProperty: "score",
      relationTypes: ["link"],
      direction: "outgoing",
      maxDepth: 5,
      effect: (ctx) => ({
        targetProperty: "score",
        value: (ctx.newValue as number) - 1,
      }),
    };
    g.addCascadeRule(rule);

    const result = g.updateProperty(a.id, "score", 100);
    // Direct: a=100, cascade: b=99, c=98
    expect(result.diffs).toHaveLength(3);
    expect(b.properties.score).toBe(99);
    expect(c.properties.score).toBe(98);
  });

  it("should respect maxDepth", () => {
    const g = new WorldGraph();
    const a = g.addEntity("T", { v: 0 });
    const b = g.addEntity("T", { v: 0 });
    const c = g.addEntity("T", { v: 0 });
    g.addRelation("link", a.id, b.id);
    g.addRelation("link", b.id, c.id);

    const rule: CascadeRule = {
      sourceType: "T",
      sourceProperty: "v",
      relationTypes: ["link"],
      direction: "outgoing",
      maxDepth: 1, // Only 1 hop
      effect: (ctx) => ({
        targetProperty: "v",
        value: (ctx.newValue as number) + 1,
      }),
    };
    g.addCascadeRule(rule);

    g.updateProperty(a.id, "v", 10);
    expect(b.properties.v).toBe(11); // reached
    expect(c.properties.v).toBe(0);  // NOT reached (depth 1 >= maxDepth 1)
  });

  it("should detect cycles and prevent infinite loops", () => {
    const g = new WorldGraph();
    const a = g.addEntity("T", { v: 0 });
    const b = g.addEntity("T", { v: 0 });
    g.addRelation("link", a.id, b.id);
    g.addRelation("link", b.id, a.id); // cycle!

    const rule: CascadeRule = {
      sourceType: "T",
      sourceProperty: "v",
      relationTypes: ["link"],
      direction: "outgoing",
      maxDepth: 10,
      effect: (ctx) => ({
        targetProperty: "v",
        value: (ctx.newValue as number) + 1,
      }),
    };
    g.addCascadeRule(rule);

    // Should NOT infinite loop
    const result = g.updateProperty(a.id, "v", 1);
    expect(result.diffs.length).toBeGreaterThanOrEqual(2); // direct a + cascade b
    expect(result.diffs.length).toBeLessThanOrEqual(3);    // at most one more back to a
  });

  it("should not propagate when no matching rule", () => {
    const g = new WorldGraph();
    const a = g.addEntity("Case", { status: "open" });
    const b = g.addEntity("Budget", { amount: 100 });
    g.addRelation("has_budget", a.id, b.id);

    // Rule for "strategy" property, not "status"
    const rule: CascadeRule = {
      sourceType: "Case",
      sourceProperty: "strategy",
      relationTypes: ["has_budget"],
      direction: "outgoing",
      maxDepth: 3,
      effect: () => ({ targetProperty: "amount", value: 0 }),
    };
    g.addCascadeRule(rule);

    const result = g.updateProperty(a.id, "status", "closed");
    expect(result.diffs).toHaveLength(1); // only direct
    expect(result.cascadeCount).toBe(0);
    expect(b.properties.amount).toBe(100);
  });

  it("should cascade via incoming direction", () => {
    const g = new WorldGraph();
    const parent = g.addEntity("Parent", { active: true });
    const child = g.addEntity("Child", { status: "idle" });
    g.addRelation("child_of", child.id, parent.id);

    const rule: CascadeRule = {
      sourceType: "Parent",
      sourceProperty: "active",
      relationTypes: ["child_of"],
      direction: "incoming",
      maxDepth: 3,
      effect: (ctx) => ({
        targetProperty: "status",
        value: ctx.newValue === false ? "disabled" : "active",
      }),
    };
    g.addCascadeRule(rule);

    g.updateProperty(parent.id, "active", false);
    expect(child.properties.status).toBe("disabled");
  });

  it("should skip cascade when effect returns undefined", () => {
    const g = new WorldGraph();
    const a = g.addEntity("T", { v: 0 });
    const b = g.addEntity("T", { v: 0 });
    g.addRelation("link", a.id, b.id);

    const rule: CascadeRule = {
      sourceType: "T",
      sourceProperty: "v",
      relationTypes: ["link"],
      direction: "outgoing",
      maxDepth: 3,
      effect: () => undefined, // always skip
    };
    g.addCascadeRule(rule);

    const result = g.updateProperty(a.id, "v", 42);
    expect(result.diffs).toHaveLength(1); // only direct
    expect(b.properties.v).toBe(0);
  });
});
