// ============================================================
// DCAS L5: Decision Store — records and queries decision history
// ============================================================

import type { WorldGraph } from "../world-model/graph.js";
import type { SimulationResult, RankedStrategies } from "../simulation/types.js";
import type { ObjectiveResult } from "../objective/types.js";
import type { DecisionRecord, DecisionOutcome, WorldSnapshot } from "./types.js";
import { generateId } from "../utils/id.js";

/**
 * In-memory decision history store.
 * Records every decision process and its eventual outcome.
 */
export class DecisionStore {
  private records = new Map<string, DecisionRecord>();

  /**
   * Record a new decision.
   */
  recordDecision(params: {
    world: WorldGraph;
    rankings: RankedStrategies;
    chosenStrategyId: string;
    chosenBy: "human" | "auto";
    reasonForChoice: string;
    objectiveResult: ObjectiveResult;
  }): DecisionRecord {
    const { world, rankings, chosenStrategyId, chosenBy, reasonForChoice, objectiveResult } = params;

    const record: DecisionRecord = {
      id: generateId(),
      timestamp: Date.now(),
      worldSnapshot: snapshotWorld(world),
      objectiveSummary: {
        kpiIds: objectiveResult.kpiResults.map((r) => r.kpiId),
        kpiValues: Object.fromEntries(objectiveResult.kpiResults.map((r) => [r.kpiId, r.value])),
      },
      candidateStrategyIds: rankings.rankings.map((r) => r.strategyId),
      candidateScores: Object.fromEntries(rankings.rankings.map((r) => [r.strategyId, r.score])),
      chosenStrategyId,
      chosenBy,
      reasonForChoice,
    };

    this.records.set(record.id, record);
    return record;
  }

  /**
   * Record the actual outcome of a decision (called after execution).
   */
  recordOutcome(
    decisionId: string,
    outcome: DecisionOutcome,
  ): boolean {
    const record = this.records.get(decisionId);
    if (!record) return false;
    record.outcome = outcome;
    return true;
  }

  /**
   * Get a decision record by ID.
   */
  get(id: string): DecisionRecord | undefined {
    return this.records.get(id);
  }

  /**
   * Get all records, newest first.
   */
  getAll(): DecisionRecord[] {
    return [...this.records.values()].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get records within a time range.
   */
  getByTimeRange(start: number, end: number): DecisionRecord[] {
    return this.getAll().filter((r) => r.timestamp >= start && r.timestamp <= end);
  }

  /**
   * Get records for a specific strategy type.
   */
  getByStrategy(strategyId: string): DecisionRecord[] {
    return this.getAll().filter((r) => r.chosenStrategyId === strategyId);
  }

  /**
   * Get records that have outcomes (for learning).
   */
  getWithOutcomes(): DecisionRecord[] {
    return this.getAll().filter((r) => r.outcome != null);
  }

  /**
   * Get the N most recent decisions.
   */
  getRecent(n: number): DecisionRecord[] {
    return this.getAll().slice(0, n);
  }

  /** Total number of records */
  get count(): number {
    return this.records.size;
  }

  /** Number of records with outcomes */
  get outcomeCount(): number {
    return this.getWithOutcomes().length;
  }
}

function snapshotWorld(world: WorldGraph): WorldSnapshot {
  const entities = world.getAllEntities();
  return {
    timestamp: Date.now(),
    entitySummaries: entities.map((e) => ({
      id: e.id,
      type: e.type,
      keyProperties: { ...e.properties },
    })),
    relationCount: world.relationCount,
    entityCount: world.entityCount,
  };
}
