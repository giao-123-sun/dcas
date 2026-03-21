import { describe, it, expect } from "vitest";
import { WorldGraph } from "../../src/world-model/graph.js";
import { forkGraph } from "../../src/world-model/fork.js";
import type { CascadeRule } from "../../src/world-model/types.js";

describe("forkGraph", () => {
  it("should copy all entities and relations", () => {
    const g = new WorldGraph();
    const a = g.addEntity("Case", { title: "案件A" });
    const b = g.addEntity("Judge", { name: "王法官" });
    g.addRelation("decided_by", a.id, b.id);

    const forked = forkGraph(g);
    expect(forked.entityCount).toBe(2);
    expect(forked.relationCount).toBe(1);
    expect(forked.getEntity(a.id)).toBeDefined();
    expect(forked.getEntity(b.id)).toBeDefined();
  });

  it("should have a different snapshotId", () => {
    const g = new WorldGraph();
    const forked = forkGraph(g);
    expect(forked.snapshotId).not.toBe(g.snapshotId);
  });

  it("should isolate mutations from source", () => {
    const g = new WorldGraph();
    const a = g.addEntity("Case", { status: "open", amount: 80000 });

    const forked = forkGraph(g);

    // Mutate forked
    forked.updateProperty(a.id, "status", "settled");
    forked.updateProperty(a.id, "amount", 65000);

    // Source unchanged
    const original = g.getEntity(a.id)!;
    expect(original.properties.status).toBe("open");
    expect(original.properties.amount).toBe(80000);

    // Forked changed
    const copy = forked.getEntity(a.id)!;
    expect(copy.properties.status).toBe("settled");
    expect(copy.properties.amount).toBe(65000);
  });

  it("should preserve cascade rules", () => {
    const g = new WorldGraph();
    const rule: CascadeRule = {
      sourceType: "Case",
      sourceProperty: "strategy",
      relationTypes: ["has_budget"],
      direction: "outgoing",
      maxDepth: 3,
      effect: () => ({ targetProperty: "amount", value: 0 }),
    };
    g.addCascadeRule(rule);

    const forked = forkGraph(g);
    expect(forked.getCascadeRules()).toHaveLength(1);
    expect(forked.getCascadeRules()[0]).toBe(rule); // shared reference
  });

  it("should support cascade in forked graph", () => {
    const g = new WorldGraph();
    const caseE = g.addEntity("Case", { strategy: "defense" });
    const budget = g.addEntity("Budget", { allocated: 50000 });
    g.addRelation("has_budget", caseE.id, budget.id);

    g.addCascadeRule({
      sourceType: "Case",
      sourceProperty: "strategy",
      relationTypes: ["has_budget"],
      direction: "outgoing",
      maxDepth: 3,
      effect: (ctx) => {
        if (ctx.newValue === "settlement") {
          return { targetProperty: "allocated", value: 30000 };
        }
        return undefined;
      },
    });

    const forked = forkGraph(g, "settlement_scenario");
    forked.updateProperty(caseE.id, "strategy", "settlement");

    // Forked budget changed
    expect(forked.getEntity(budget.id)!.properties.allocated).toBe(30000);
    // Original budget unchanged
    expect(g.getEntity(budget.id)!.properties.allocated).toBe(50000);
  });

  it("should support label", () => {
    const g = new WorldGraph();
    const forked = forkGraph(g, "scenario_A");
    expect(forked.label).toBe("scenario_A");
  });

  it("should allow parallel forks from same source", () => {
    const g = new WorldGraph();
    const e = g.addEntity("Case", { strategy: "unknown" });

    const forkA = forkGraph(g, "full_defense");
    const forkB = forkGraph(g, "settlement");
    const forkC = forkGraph(g, "jurisdiction_challenge");

    forkA.updateProperty(e.id, "strategy", "full_defense");
    forkB.updateProperty(e.id, "strategy", "settlement");
    forkC.updateProperty(e.id, "strategy", "jurisdiction_challenge");

    // All independent
    expect(g.getEntity(e.id)!.properties.strategy).toBe("unknown");
    expect(forkA.getEntity(e.id)!.properties.strategy).toBe("full_defense");
    expect(forkB.getEntity(e.id)!.properties.strategy).toBe("settlement");
    expect(forkC.getEntity(e.id)!.properties.strategy).toBe("jurisdiction_challenge");
  });
});
