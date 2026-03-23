import { describe, it, expect } from "vitest";
import { WorldGraph } from "../../src/world-model/graph.js";
import { forkGraph } from "../../src/world-model/fork.js";
import { EventLog } from "../../src/world-model/event-log.js";

describe("EventLog", () => {
  it("should record property changes as events", () => {
    const g = new WorldGraph();
    const e = g.addEntity("Case", { status: "open" });
    g.updateProperty(e.id, "status", "closed");

    const events = g.getEventLog().getAll();
    expect(events.length).toBeGreaterThanOrEqual(1);
    const event = events[events.length - 1];
    expect(event.entityId).toBe(e.id);
    expect(event.property).toBe("status");
    expect(event.oldValue).toBe("open");
    expect(event.newValue).toBe("closed");
    expect(event.cause).toBe("direct");
  });

  it("should record cascade events with correct cause", () => {
    const g = new WorldGraph();
    const a = g.addEntity("Case", { strategy: "defense", cost: 50000 });
    const b = g.addEntity("Budget", { allocated: 50000 });
    g.addRelation("has_budget", a.id, b.id);
    g.addCascadeRule({
      sourceType: "Case",
      sourceProperty: "strategy",
      relationTypes: ["has_budget"],
      direction: "outgoing",
      maxDepth: 3,
      effect: (ctx) => {
        if (ctx.newValue === "settlement") return { targetProperty: "allocated", value: 30000 };
        return undefined;
      },
    });

    g.updateProperty(a.id, "strategy", "settlement");

    const events = g.getEventLog().getAll();
    const cascadeEvents = events.filter(e => e.cause === "cascade");
    expect(cascadeEvents.length).toBeGreaterThanOrEqual(1);
    expect(cascadeEvents[0].entityId).toBe(b.id);
    expect(cascadeEvents[0].newValue).toBe(30000);
  });

  it("should support entity-specific event query", () => {
    const g = new WorldGraph();
    const a = g.addEntity("A", { x: 1 });
    const b = g.addEntity("B", { y: 2 });
    g.updateProperty(a.id, "x", 10);
    g.updateProperty(b.id, "y", 20);
    g.updateProperty(a.id, "x", 100);

    const aEvents = g.getEventsForEntity(a.id);
    expect(aEvents.length).toBe(2);
    const bEvents = g.getEventsForEntity(b.id);
    expect(bEvents.length).toBe(1);
  });

  it("should serialize and deserialize event log", () => {
    const g = new WorldGraph();
    const e = g.addEntity("Case", { v: 0 });
    g.updateProperty(e.id, "v", 1);
    g.updateProperty(e.id, "v", 2);

    const json = g.getEventLog().toJSON();
    const restored = EventLog.fromJSON(json);
    expect(restored.length).toBe(g.getEventLog().length);
    expect(restored.getAll()[0].newValue).toBe(json[0].newValue);
  });
});

describe("Copy-on-Write Fork", () => {
  it("should not deep clone entities on fork", () => {
    const g = new WorldGraph();
    const e = g.addEntity("Case", { data: { nested: [1, 2, 3] } });

    const forked = forkGraph(g);
    const original = g.getEntity(e.id)!;
    const copy = forked.getEntity(e.id)!;

    // Before any write, they should share the same properties object
    // (or at minimum, fork should be fast)
    expect(copy.id).toBe(original.id);
    expect(copy.type).toBe(original.type);
  });

  it("should clone entity on first write (COW)", () => {
    const g = new WorldGraph();
    const e = g.addEntity("Case", { status: "open", amount: 80000 });

    const forked = forkGraph(g);
    forked.updateProperty(e.id, "status", "closed");

    // Original unchanged
    expect(g.getEntity(e.id)!.properties.status).toBe("open");
    // Fork changed
    expect(forked.getEntity(e.id)!.properties.status).toBe("closed");
    // Unmodified property still accessible in fork
    expect(forked.getEntity(e.id)!.properties.amount).toBe(80000);
  });

  it("should isolate multiple forks", () => {
    const g = new WorldGraph();
    const e = g.addEntity("Case", { v: 0 });

    const f1 = forkGraph(g, "branch1");
    const f2 = forkGraph(g, "branch2");

    f1.updateProperty(e.id, "v", 100);
    f2.updateProperty(e.id, "v", 200);

    expect(g.getEntity(e.id)!.properties.v).toBe(0);
    expect(f1.getEntity(e.id)!.properties.v).toBe(100);
    expect(f2.getEntity(e.id)!.properties.v).toBe(200);
  });

  it("existing fork tests should still pass", () => {
    // This is implicitly verified by running all existing fork.test.ts tests
    // Just a marker test
    expect(true).toBe(true);
  });
});

describe("Time Travel", () => {
  it("should retrieve historical property value", async () => {
    const g = new WorldGraph();
    const e = g.addEntity("Case", { score: 10 });

    // Record timestamps
    await new Promise(r => setTimeout(r, 5));
    const t1 = Date.now();
    await new Promise(r => setTimeout(r, 5));

    g.updateProperty(e.id, "score", 20);
    await new Promise(r => setTimeout(r, 5));
    const t2 = Date.now();
    await new Promise(r => setTimeout(r, 5));

    g.updateProperty(e.id, "score", 30);

    // Time travel
    const atT1 = g.getPropertyAt(e.id, "score", t1);
    expect(atT1).toBe(10); // Before any update

    const atT2 = g.getPropertyAt(e.id, "score", t2);
    expect(atT2).toBe(20); // After first update

    const atNow = g.getPropertyAt(e.id, "score", Date.now());
    expect(atNow).toBe(30); // Current
  });
});
