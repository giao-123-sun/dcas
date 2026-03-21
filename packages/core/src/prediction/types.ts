// ============================================================
// DCAS L3: Prediction Engine — Type Definitions
// ============================================================

import type { WorldGraph } from "../world-model/graph.js";
import type { PropertyValue } from "../world-model/types.js";

/**
 * A probability distribution over possible outcomes.
 * Core output format — every prediction returns this, not point estimates.
 */
export interface ProbabilityDistribution {
  mean: number;
  median: number;
  std: number;
  percentiles: {
    p5: number;
    p25: number;
    p75: number;
    p95: number;
  };
  /** Model's confidence in this prediction [0, 1] */
  confidence: number;
  /** Which model produced this */
  modelId: string;
}

/**
 * Context passed to a prediction model.
 */
export interface PredictionContext {
  world: WorldGraph;
  /** Optional hypothetical action to predict the effect of */
  action?: PredictionAction;
  /** Which property to predict */
  targetProperty: string;
  /** Which entity type to predict for */
  targetEntityType?: string;
}

/**
 * A hypothetical action for "what-if" prediction.
 */
export interface PredictionAction {
  type: string;
  description: string;
  parameters: Record<string, PropertyValue>;
}

/**
 * A prediction model interface.
 */
export interface PredictionModel {
  id: string;
  type: "heuristic" | "statistical" | "adversary" | "llm";
  /** Which property this model predicts */
  targetProperty: string;
  /** Historical accuracy score [0, 1] */
  accuracy: number;

  predict(context: PredictionContext): ProbabilityDistribution;
}

/**
 * Result of an ensemble prediction (multiple models combined).
 */
export interface EnsemblePrediction {
  /** The combined distribution */
  combined: ProbabilityDistribution;
  /** Individual model predictions */
  individual: ProbabilityDistribution[];
  /** Which models were used */
  modelIds: string[];
}
