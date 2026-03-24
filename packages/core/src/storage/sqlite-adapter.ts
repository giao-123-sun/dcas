import Database from "better-sqlite3";
import type { DecisionRecord, DecisionOutcome, Pattern, PatternCondition } from "../memory/types.js";
import { generateId } from "../utils/id.js";

/**
 * SQLite-backed Decision Store.
 * Drop-in replacement for the in-memory DecisionStore.
 */
export class SQLiteDecisionStore {
  private db: Database.Database;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        data TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(timestamp)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_decisions_strategy ON decisions(json_extract(data, '$.chosenStrategyId'))
    `);
  }

  recordDecision(params: {
    world: any;  // We serialize the snapshot, not the full WorldGraph
    rankings: any;
    chosenStrategyId: string;
    chosenBy: "human" | "auto";
    reasonForChoice: string;
    objectiveResult: any;
  }): DecisionRecord {
    const record: DecisionRecord = {
      id: generateId(),
      timestamp: Date.now(),
      worldSnapshot: {
        timestamp: Date.now(),
        entitySummaries: params.world.getAllEntities ?
          params.world.getAllEntities().map((e: any) => ({
            id: e.id,
            type: e.type,
            keyProperties: { ...e.properties },
          })) : [],
        relationCount: params.world.relationCount ?? 0,
        entityCount: params.world.entityCount ?? 0,
      },
      objectiveSummary: {
        kpiIds: params.objectiveResult.kpiResults.map((r: any) => r.kpiId),
        kpiValues: Object.fromEntries(params.objectiveResult.kpiResults.map((r: any) => [r.kpiId, r.value])),
      },
      candidateStrategyIds: params.rankings.rankings.map((r: any) => r.strategyId),
      candidateScores: Object.fromEntries(params.rankings.rankings.map((r: any) => [r.strategyId, r.score])),
      chosenStrategyId: params.chosenStrategyId,
      chosenBy: params.chosenBy,
      reasonForChoice: params.reasonForChoice,
    };

    this.db.prepare("INSERT INTO decisions (id, timestamp, data) VALUES (?, ?, ?)")
      .run(record.id, record.timestamp, JSON.stringify(record));
    return record;
  }

  recordOutcome(decisionId: string, outcome: DecisionOutcome): boolean {
    const row = this.db.prepare("SELECT data FROM decisions WHERE id = ?").get(decisionId) as any;
    if (!row) return false;
    const record = JSON.parse(row.data) as DecisionRecord;
    record.outcome = outcome;
    this.db.prepare("UPDATE decisions SET data = ? WHERE id = ?")
      .run(JSON.stringify(record), decisionId);
    return true;
  }

  get(id: string): DecisionRecord | undefined {
    const row = this.db.prepare("SELECT data FROM decisions WHERE id = ?").get(id) as any;
    return row ? JSON.parse(row.data) : undefined;
  }

  getAll(): DecisionRecord[] {
    const rows = this.db.prepare("SELECT data FROM decisions ORDER BY timestamp DESC").all() as any[];
    return rows.map(r => JSON.parse(r.data));
  }

  getByTimeRange(start: number, end: number): DecisionRecord[] {
    const rows = this.db.prepare("SELECT data FROM decisions WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC")
      .all(start, end) as any[];
    return rows.map(r => JSON.parse(r.data));
  }

  getByStrategy(strategyId: string): DecisionRecord[] {
    return this.getAll().filter(r => r.chosenStrategyId === strategyId);
  }

  getWithOutcomes(): DecisionRecord[] {
    return this.getAll().filter(r => r.outcome != null);
  }

  getRecent(n: number): DecisionRecord[] {
    const rows = this.db.prepare("SELECT data FROM decisions ORDER BY timestamp DESC LIMIT ?").all(n) as any[];
    return rows.map(r => JSON.parse(r.data));
  }

  get count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM decisions").get() as any;
    return row.cnt;
  }

  get outcomeCount(): number {
    return this.getWithOutcomes().length;
  }

  close(): void {
    this.db.close();
  }
}

/**
 * SQLite-backed Pattern Memory.
 * Drop-in replacement for the in-memory PatternMemory.
 */
export class SQLitePatternMemory {
  private db: Database.Database;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        confidence REAL NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns(confidence DESC)
    `);
  }

  addPattern(params: {
    description: string;
    condition: PatternCondition;
    observation: string;
    confidence: number;
    exampleDecisionId: string;
  }): Pattern {
    // Check for similar existing pattern
    const existing = this.findSimilar(params.condition, params.observation);
    if (existing) {
      existing.supportCount += 1;
      existing.confidence = Math.min(0.99, existing.confidence + (1 - existing.confidence) * 0.1);
      existing.examples.push(params.exampleDecisionId);
      if (existing.examples.length > 10) existing.examples.shift();
      existing.updatedAt = Date.now();
      this.db.prepare("UPDATE patterns SET data = ?, confidence = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(existing), existing.confidence, existing.updatedAt, existing.id);
      return existing;
    }

    const pattern: Pattern = {
      id: generateId(),
      description: params.description,
      condition: params.condition,
      observation: params.observation,
      confidence: params.confidence,
      supportCount: 1,
      examples: [params.exampleDecisionId],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.db.prepare("INSERT INTO patterns (id, data, confidence, updated_at) VALUES (?, ?, ?, ?)")
      .run(pattern.id, JSON.stringify(pattern), pattern.confidence, pattern.updatedAt);
    return pattern;
  }

  query(condition: Partial<PatternCondition>): Pattern[] {
    return this.getAll().filter(p => {
      if (condition.entityTypes && p.condition.entityTypes) {
        const overlap = condition.entityTypes.some(t => p.condition.entityTypes!.includes(t));
        if (!overlap) return false;
      }
      if (condition.strategyTypes && p.condition.strategyTypes) {
        const overlap = condition.strategyTypes.some(t => p.condition.strategyTypes!.includes(t));
        if (!overlap) return false;
      }
      return true;
    });
  }

  getAll(): Pattern[] {
    const rows = this.db.prepare("SELECT data FROM patterns ORDER BY confidence DESC").all() as any[];
    return rows.map(r => JSON.parse(r.data));
  }

  getHighConfidence(threshold = 0.7): Pattern[] {
    const rows = this.db.prepare("SELECT data FROM patterns WHERE confidence >= ? ORDER BY confidence DESC")
      .all(threshold) as any[];
    return rows.map(r => JSON.parse(r.data));
  }

  get count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM patterns").get() as any;
    return row.cnt;
  }

  close(): void {
    this.db.close();
  }

  private findSimilar(condition: PatternCondition, observation: string): Pattern | undefined {
    for (const p of this.getAll()) {
      const sameTypes = JSON.stringify([...(p.condition.entityTypes ?? [])].sort()) ===
        JSON.stringify([...(condition.entityTypes ?? [])].sort());
      const similarObs = p.observation === observation;
      if (sameTypes && similarObs) return p;
    }
    return undefined;
  }
}
