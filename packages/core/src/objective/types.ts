// ============================================================
// DCAS L2: Objective Function — Type Definitions
// ============================================================

import type { WorldGraph } from "../world-model/graph.js";

/**
 * A Key Performance Indicator computed from the world model.
 */
export interface KPI {
  id: string;
  name: string;
  direction: "maximize" | "minimize";
  /** Weight in [0, 1]. All KPI weights should sum to 1. */
  weight: number;
  /** How to compute the current value from the world model */
  compute: (world: WorldGraph) => number;
  /** Optional target value */
  target?: number;
  /** Optional alert threshold */
  threshold?: number;
}

/**
 * Evaluated KPI with its current value and normalized score.
 */
export interface KPIResult {
  kpiId: string;
  name: string;
  direction: "maximize" | "minimize";
  weight: number;
  value: number;
  /** Normalized score in [0, 1] where 1 = best */
  normalizedScore: number;
  /** Whether this KPI breached its threshold */
  alert: boolean;
}

/**
 * A constraint on the world model or actions.
 */
export interface Constraint {
  id: string;
  description: string;
  severity: "hard" | "soft";
  /** Returns true if constraint is satisfied */
  check: (world: WorldGraph) => boolean;
}

export interface ConstraintResult {
  constraintId: string;
  description: string;
  severity: "hard" | "soft";
  satisfied: boolean;
}

/**
 * A tradeoff preference between two KPIs.
 * preference > 0 means prefer kpiA over kpiB.
 */
export interface Tradeoff {
  kpiA: string;
  kpiB: string;
  /** Range [-1, 1]. Positive = prefer A, negative = prefer B */
  preference: number;
  /** Where this tradeoff was learned from */
  learnedFrom?: string;
}

/**
 * The complete objective function specification.
 */
export interface ObjectiveSpec {
  kpis: KPI[];
  constraints: Constraint[];
  tradeoffs: Tradeoff[];
}

/**
 * Result of evaluating an objective function against a world state.
 */
export interface ObjectiveResult {
  /** Weighted composite score in [0, 1] */
  score: number;
  kpiResults: KPIResult[];
  constraintResults: ConstraintResult[];
  /** True if any hard constraint is violated */
  hardViolation: boolean;
  /** Number of soft constraint violations */
  softViolations: number;
  /** KPIs that breached their alert threshold */
  alerts: string[];
}
