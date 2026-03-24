// ============================================================
// DCAS L4: Simulation & Strategy — Type Definitions
// ============================================================

import type { WorldGraph } from "../world-model/graph.js";
import type { EntityId, PropertyValue, PropertyDiff } from "../world-model/types.js";
import type { ProbabilityDistribution } from "../prediction/types.js";
import type { ObjectiveResult } from "../objective/types.js";
import type { FeasibilityResult } from "../self-model/types.js";

/**
 * A concrete action that modifies the world model.
 */
export interface Action {
  /** Human-readable description */
  description: string;
  /** Which entity to modify */
  entityId: EntityId;
  /** Which property to set */
  property: string;
  /** New value */
  value: PropertyValue;
}

/**
 * A conditional action: if condition is true after a step, apply the action.
 */
export interface ConditionalAction {
  description: string;
  /** Check against the current world state */
  condition: (world: WorldGraph) => boolean;
  /** Action to apply if condition is met */
  action: Action;
}

/**
 * A complete strategy: a sequence of actions + optional conditionals.
 */
export interface Strategy {
  id: string;
  name: string;
  description: string;
  /** Ordered actions to execute step by step */
  actions: Action[];
  /** Conditional actions evaluated after each step */
  conditionals?: ConditionalAction[];
  /** How this strategy was generated */
  generatedBy: "template" | "combinatorial" | "llm" | "manual";
}

/**
 * Result of simulating a single strategy.
 */
export interface SimulationResult {
  strategyId: string;
  strategyName: string;
  /** The forked world after simulation */
  forkedWorld: WorldGraph;
  /** All property diffs that occurred during simulation */
  diffs: PropertyDiff[];
  /** KPI predictions at each step */
  stepPredictions: Map<string, ProbabilityDistribution>[];
  /** Final objective evaluation */
  objectiveResult: ObjectiveResult;
  /** Risk profile from predictions */
  riskProfile: RiskProfile;
  /** Reasoning chain for explainability */
  reasoningChain: string[];
  /** Number of MC runs actually executed */
  monteCarloRuns: number;
  /** KPI distributions from MC sampling */
  kpiDistributions: Map<string, ProbabilityDistribution>;
  /** Per-run KPI values (if keepPerRunResults=true) */
  perRunResults?: Array<Record<string, number>>;
  /** Whether MC converged early */
  converged: boolean;
  /** Feasibility check result (only present when SelfModel provided) */
  feasibility?: FeasibilityResult;
}

export interface MonteCarloConfig {
  /** Number of MC runs (default 100) */
  runs: number;
  /** Max simulation steps per run (default 10) */
  maxSteps: number;
  /** Random seed for reproducibility */
  seed?: number;
  /** Keep per-run results for debugging/visualization */
  keepPerRunResults?: boolean;
  /** Early stopping: coefficient of variation threshold */
  convergenceThreshold?: number;
  /** Minimum runs before checking convergence */
  minRunsBeforeConvergence?: number;
}

export interface RiskProfile {
  /** Best case (p95 for maximize, p5 for minimize) */
  bestCase: number;
  /** Expected case (mean) */
  expectedCase: number;
  /** Worst case (p5 for maximize, p95 for minimize) */
  worstCase: number;
}

/**
 * Multiple strategies compared and ranked.
 */
export interface RankedStrategies {
  rankings: RankedStrategy[];
  /** The world state all strategies branched from */
  baseSnapshotId: string;
}

export interface RankedStrategy {
  rank: number;
  strategyId: string;
  strategyName: string;
  score: number;
  riskProfile: RiskProfile;
  objectiveResult: ObjectiveResult;
  /** Why this rank */
  reasoning: string;
  /** Feasibility check result (only present when SelfModel provided) */
  feasibility?: FeasibilityResult;
}
