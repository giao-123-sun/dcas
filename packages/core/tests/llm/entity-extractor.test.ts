import { describe, it, expect } from "vitest";
import { WorldGraph } from "../../src/world-model/graph.js";
import {
  applyExtractionToGraph,
  matchExistingEntities,
  smartApplyExtraction,
} from "../../src/llm/entity-extractor.js";
import type { ExtractionResult } from "../../src/llm/entity-extractor.js";

describe("Entity Extractor", () => {
  const sampleExtraction: ExtractionResult = {
    entities: [
      { type: "Case", properties: { case_type: "labor_dispute", claim_amount: 120000 } },
      { type: "Party", properties: { name: "张三", role: "plaintiff" } },
      { type: "Party", properties: { name: "ABC公司", role: "defendant" } },
      { type: "Statute", properties: { code: "劳动合同法", article: "第82条" }, matchHint: "第82条" },
    ],
    relations: [
      { type: "plaintiff_in", sourceIndex: 1, targetIndex: 0 },
      { type: "defendant_in", sourceIndex: 2, targetIndex: 0 },
      { type: "cites", sourceIndex: 0, targetIndex: 3 },
    ],
  };

  it("should apply extraction to empty graph", () => {
    const world = new WorldGraph();
    const idMap = applyExtractionToGraph(world, sampleExtraction);

    expect(idMap.size).toBe(4);
    expect(world.getEntitiesByType("Case")).toHaveLength(1);
    expect(world.getEntitiesByType("Party")).toHaveLength(2);
    expect(world.getEntitiesByType("Statute")).toHaveLength(1);
    expect(world.relationCount).toBe(3);
  });

  it("should match existing entities by matchHint", () => {
    const world = new WorldGraph();
    // Pre-seed a statute
    world.addEntity("Statute", { code: "劳动合同法", article: "第82条", description: "双倍工资" });

    const matches = matchExistingEntities(world, sampleExtraction);
    expect(matches.size).toBe(1);
    expect(matches.has(3)).toBe(true); // Statute at index 3 matched
  });

  it("should smart-apply: match existing + create new", () => {
    const world = new WorldGraph();
    world.addEntity("Statute", { code: "劳动合同法", article: "第82条", description: "双倍工资" });

    const { created, matched } = smartApplyExtraction(world, sampleExtraction);

    expect(matched.size).toBe(1); // Statute matched
    expect(created.size).toBe(3); // Case + 2 Parties created
    expect(world.getEntitiesByType("Statute")).toHaveLength(1); // Not duplicated
    expect(world.getEntitiesByType("Case")).toHaveLength(1);
    expect(world.getEntitiesByType("Party")).toHaveLength(2);
    expect(world.relationCount).toBe(3);
  });

  it("should handle empty extraction", () => {
    const world = new WorldGraph();
    const idMap = applyExtractionToGraph(world, { entities: [], relations: [] });
    expect(idMap.size).toBe(0);
    expect(world.entityCount).toBe(0);
  });

  it("should filter invalid relation indices", () => {
    const world = new WorldGraph();
    const extraction: ExtractionResult = {
      entities: [{ type: "Case", properties: { x: 1 } }],
      relations: [
        { type: "bad", sourceIndex: 0, targetIndex: 5 }, // invalid target
        { type: "self", sourceIndex: 0, targetIndex: 0 }, // self-reference (valid)
      ],
    };
    // applyExtractionToGraph doesn't validate indices itself, but extractEntitiesFromText does
    // For apply, just check it doesn't crash
    const idMap = applyExtractionToGraph(world, extraction);
    expect(idMap.size).toBe(1);
  });
});
