import { describe, it, expect } from "vitest";
import { WorldGraph } from "../../src/world-model/graph.js";
import type { EntityId } from "../../src/world-model/types.js";

describe("WorldGraph", () => {
  it("should create an entity with properties", () => {
    const g = new WorldGraph();
    const e = g.addEntity("Case", { title: "劳动仲裁案", amount: 80000 });

    expect(e.id).toBeDefined();
    expect(e.type).toBe("Case");
    expect(e.properties.title).toBe("劳动仲裁案");
    expect(e.properties.amount).toBe(80000);
    expect(g.entityCount).toBe(1);
  });

  it("should retrieve entity by id", () => {
    const g = new WorldGraph();
    const e = g.addEntity("Judge", { name: "王法官" });
    expect(g.getEntity(e.id)).toBe(e);
    expect(g.getEntity("nonexistent" as EntityId)).toBeUndefined();
  });

  it("should query entities by type", () => {
    const g = new WorldGraph();
    g.addEntity("Case", { title: "案件A" });
    g.addEntity("Case", { title: "案件B" });
    g.addEntity("Judge", { name: "张法官" });

    const cases = g.getEntitiesByType("Case");
    expect(cases).toHaveLength(2);

    const judges = g.getEntitiesByType("Judge");
    expect(judges).toHaveLength(1);

    expect(g.getEntitiesByType("Statute")).toHaveLength(0);
  });

  it("should create relations between entities", () => {
    const g = new WorldGraph();
    const caseE = g.addEntity("Case", { title: "案件" });
    const judge = g.addEntity("Judge", { name: "王法官" });
    const rel = g.addRelation("decided_by", caseE.id, judge.id, { role: "主审" });

    expect(rel.sourceId).toBe(caseE.id);
    expect(rel.targetId).toBe(judge.id);
    expect(rel.type).toBe("decided_by");
    expect(rel.properties.role).toBe("主审");
    expect(g.relationCount).toBe(1);
  });

  it("should throw when creating relation with nonexistent entity", () => {
    const g = new WorldGraph();
    const e = g.addEntity("Case", {});
    expect(() => g.addRelation("rel", e.id, "fake" as EntityId)).toThrow();
    expect(() => g.addRelation("rel", "fake" as EntityId, e.id)).toThrow();
  });

  it("should get outgoing neighbors", () => {
    const g = new WorldGraph();
    const a = g.addEntity("Case", { title: "案件" });
    const b = g.addEntity("Judge", { name: "王法官" });
    const c = g.addEntity("Statute", { code: "劳动法" });
    g.addRelation("decided_by", a.id, b.id);
    g.addRelation("applies", a.id, c.id);

    const neighbors = g.getNeighbors(a.id, "outgoing");
    expect(neighbors).toHaveLength(2);

    const judgeNeighbors = g.getNeighbors(a.id, "outgoing", ["decided_by"]);
    expect(judgeNeighbors).toHaveLength(1);
    expect(judgeNeighbors[0].entity.id).toBe(b.id);
  });

  it("should get incoming neighbors", () => {
    const g = new WorldGraph();
    const a = g.addEntity("Case", { title: "案件" });
    const b = g.addEntity("Judge", { name: "王法官" });
    g.addRelation("decided_by", a.id, b.id);

    const incoming = g.getNeighbors(b.id, "incoming");
    expect(incoming).toHaveLength(1);
    expect(incoming[0].entity.id).toBe(a.id);
  });

  it("should get both-direction neighbors", () => {
    const g = new WorldGraph();
    const a = g.addEntity("A", {});
    const b = g.addEntity("B", {});
    const c = g.addEntity("C", {});
    g.addRelation("link", a.id, b.id);
    g.addRelation("link", c.id, b.id);

    const both = g.getNeighbors(b.id, "both");
    expect(both).toHaveLength(2);
  });

  it("should update property and return direct diff", () => {
    const g = new WorldGraph();
    const e = g.addEntity("Case", { status: "open" });

    const result = g.updateProperty(e.id, "status", "closed");
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0].oldValue).toBe("open");
    expect(result.diffs[0].newValue).toBe("closed");
    expect(result.diffs[0].cause).toBe("direct");
    expect(e.properties.status).toBe("closed");
  });

  it("should skip update if value unchanged", () => {
    const g = new WorldGraph();
    const e = g.addEntity("Case", { status: "open" });

    const result = g.updateProperty(e.id, "status", "open");
    expect(result.diffs).toHaveLength(0);
  });

  it("should remove entity and cleanup relations", () => {
    const g = new WorldGraph();
    const a = g.addEntity("Case", {});
    const b = g.addEntity("Judge", {});
    g.addRelation("decided_by", a.id, b.id);

    expect(g.entityCount).toBe(2);
    expect(g.relationCount).toBe(1);

    g.removeEntity(a.id);
    expect(g.entityCount).toBe(1);
    expect(g.relationCount).toBe(0);
    expect(g.getEntity(a.id)).toBeUndefined();
  });

  it("should remove relation", () => {
    const g = new WorldGraph();
    const a = g.addEntity("A", {});
    const b = g.addEntity("B", {});
    const rel = g.addRelation("link", a.id, b.id);

    expect(g.removeRelation(rel.id)).toBe(true);
    expect(g.relationCount).toBe(0);
    expect(g.getNeighbors(a.id, "outgoing")).toHaveLength(0);
  });

  it("should return false when removing nonexistent entities/relations", () => {
    const g = new WorldGraph();
    expect(g.removeEntity("fake" as EntityId)).toBe(false);
    expect(g.removeRelation("fake" as any)).toBe(false);
  });
});
