// ============================================================
// DCAS L5: Memory & Learning — Type Definitions
// ============================================================

import type { PropertyValue } from "../world-model/types.js";

/**
 * A snapshot of the world model at decision time.
 * Lightweight — stores entity summaries, not the full graph.
 */
export interface WorldSnapshot {
  timestamp: number;
  entitySummaries: Array<{
    id: string;
    type: string;
    keyProperties: Record<string, PropertyValue>;
  }>;
  relationCount: number;
  entityCount: number;
}

/**
 * A record of a single decision process.
 */
export interface DecisionRecord {
  id: string;
  timestamp: number;

  // State at decision time
  worldSnapshot: WorldSnapshot;
  objectiveSummary: {
    kpiIds: string[];
    kpiValues: Record<string, number>;
  };

  // Decision process
  candidateStrategyIds: string[];
  candidateScores: Record<string, number>;
  chosenStrategyId: string;
  chosenBy: "human" | "auto";
  reasonForChoice: string;

  // Actual outcome (filled post-hoc)
  outcome?: DecisionOutcome;
}

export interface DecisionOutcome {
  timestamp: number;
  actualKPIValues: Record<string, number>;
  /** predicted - actual for each KPI (key learning signal) */
  deviations: Record<string, number>;
  unexpectedEffects: string[];
  notes?: string;
}

/**
 * A learned pattern from decision history.
 */
export interface Pattern {
  id: string;
  description: string;
  /** When this pattern applies */
  condition: PatternCondition;
  /** What was observed */
  observation: string;
  /** Confidence based on supporting evidence count */
  confidence: number;
  /** How many decisions support this pattern */
  supportCount: number;
  /** Example decision IDs */
  examples: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PatternCondition {
  entityTypes?: string[];
  propertyRanges?: Record<string, { min?: number; max?: number }>;
  strategyTypes?: string[];
}

/**
 * A learning update to be applied to the system.
 */
export interface LearningUpdate {
  type: "confidence_up" | "confidence_down" | "recalibrate" | "ontology_suggestion" | "new_pattern";
  target: string;
  data: Record<string, unknown>;
  reason: string;
}
