import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { SQLiteDecisionStore, SQLitePatternMemory } from "../../src/storage/sqlite-adapter.js";

describe("SQLiteDecisionStore", () => {
  let store: SQLiteDecisionStore;

  afterEach(() => {
    store?.close();
  });

  it("should record and retrieve decisions", () => {
    store = new SQLiteDecisionStore(); // in-memory
    const mockWorld = {
      getAllEntities: () => [{ id: "e1", type: "Case", properties: { x: 1 } }],
      entityCount: 1,
      relationCount: 0,
    };
    const mockRankings = {
      rankings: [{ strategyId: "s1", score: 0.8 }],
    };
    const mockObjective = {
      kpiResults: [{ kpiId: "recovery", value: 65000 }],
    };

    const record = store.recordDecision({
      world: mockWorld,
      rankings: mockRankings,
      chosenStrategyId: "s1",
      chosenBy: "human",
      reasonForChoice: "test",
      objectiveResult: mockObjective,
    });

    expect(record.id).toBeDefined();
    expect(store.count).toBe(1);
    expect(store.get(record.id)?.chosenStrategyId).toBe("s1");
  });

  it("should record outcome post-hoc", () => {
    store = new SQLiteDecisionStore();
    const record = store.recordDecision({
      world: { getAllEntities: () => [], entityCount: 0, relationCount: 0 },
      rankings: { rankings: [{ strategyId: "s1", score: 0.5 }] },
      chosenStrategyId: "s1",
      chosenBy: "auto",
      reasonForChoice: "auto",
      objectiveResult: { kpiResults: [{ kpiId: "r", value: 50000 }] },
    });

    const success = store.recordOutcome(record.id, {
      timestamp: Date.now(),
      actualKPIValues: { r: 48000 },
      deviations: { r: -0.04 },
      unexpectedEffects: [],
    });

    expect(success).toBe(true);
    expect(store.get(record.id)?.outcome).toBeDefined();
    expect(store.outcomeCount).toBe(1);
  });

  it("should persist across close/reopen with file path", () => {
    const dbPath = path.join(import.meta.dirname ?? __dirname, "test-decisions.db");
    store = new SQLiteDecisionStore(dbPath);
    store.recordDecision({
      world: { getAllEntities: () => [], entityCount: 0, relationCount: 0 },
      rankings: { rankings: [{ strategyId: "s1", score: 0.5 }] },
      chosenStrategyId: "s1",
      chosenBy: "human",
      reasonForChoice: "persist test",
      objectiveResult: { kpiResults: [] },
    });
    store.close();

    // Reopen
    const store2 = new SQLiteDecisionStore(dbPath);
    expect(store2.count).toBe(1);
    expect(store2.getAll()[0].reasonForChoice).toBe("persist test");
    store2.close();

    // Clean up
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + "-wal"); } catch {}
    try { fs.unlinkSync(dbPath + "-shm"); } catch {}
  });

  it("should get recent decisions", () => {
    store = new SQLiteDecisionStore();
    for (let i = 0; i < 5; i++) {
      store.recordDecision({
        world: { getAllEntities: () => [], entityCount: 0, relationCount: 0 },
        rankings: { rankings: [{ strategyId: `s${i}`, score: 0.5 }] },
        chosenStrategyId: `s${i}`,
        chosenBy: "human",
        reasonForChoice: `reason_${i}`,
        objectiveResult: { kpiResults: [] },
      });
    }
    expect(store.getRecent(3)).toHaveLength(3);
    expect(store.count).toBe(5);
  });
});

describe("SQLitePatternMemory", () => {
  let mem: SQLitePatternMemory;

  afterEach(() => {
    mem?.close();
  });

  it("should add and query patterns", () => {
    mem = new SQLitePatternMemory();
    mem.addPattern({
      description: "test pattern",
      condition: { entityTypes: ["Case"], strategyTypes: ["settlement"] },
      observation: "works well",
      confidence: 0.6,
      exampleDecisionId: "d1",
    });

    expect(mem.count).toBe(1);
    const matches = mem.query({ strategyTypes: ["settlement"] });
    expect(matches).toHaveLength(1);
  });

  it("should reinforce existing pattern", () => {
    mem = new SQLitePatternMemory();
    mem.addPattern({
      description: "test",
      condition: { entityTypes: ["Case"] },
      observation: "same obs",
      confidence: 0.5,
      exampleDecisionId: "d1",
    });
    mem.addPattern({
      description: "test",
      condition: { entityTypes: ["Case"] },
      observation: "same obs",
      confidence: 0.5,
      exampleDecisionId: "d2",
    });

    expect(mem.count).toBe(1); // Still 1 pattern, just reinforced
    const all = mem.getAll();
    expect(all[0].supportCount).toBe(2);
    expect(all[0].confidence).toBeGreaterThan(0.5);
  });

  it("should filter by confidence threshold", () => {
    mem = new SQLitePatternMemory();
    mem.addPattern({ description: "high", condition: {}, observation: "h", confidence: 0.9, exampleDecisionId: "d1" });
    mem.addPattern({ description: "low", condition: {}, observation: "l", confidence: 0.3, exampleDecisionId: "d2" });

    expect(mem.getHighConfidence(0.7)).toHaveLength(1);
    expect(mem.getAll()).toHaveLength(2);
  });
});
