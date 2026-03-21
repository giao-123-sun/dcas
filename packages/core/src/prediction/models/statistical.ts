// ============================================================
// Statistical Prediction Model — simple feature-based regression
// ============================================================

import type { PredictionContext, PredictionModel, ProbabilityDistribution } from "../types.js";
import { normalDistribution } from "../distribution.js";
import type { WorldGraph } from "../../world-model/graph.js";

/**
 * A feature extractor: pulls a numeric value from the world model.
 */
export interface Feature {
  name: string;
  extract: (world: WorldGraph) => number;
}

/**
 * Simple linear regression model.
 * prediction = intercept + sum(coefficient[i] * feature[i])
 *
 * For MVP, coefficients are set manually (domain expert calibration).
 * In production, these would be learned from historical data.
 */
export class StatisticalModel implements PredictionModel {
  readonly type = "statistical" as const;

  constructor(
    readonly id: string,
    readonly targetProperty: string,
    private features: Feature[],
    private coefficients: number[],
    private intercept: number,
    private residualStd: number,
    public accuracy: number = 0.7,
  ) {
    if (features.length !== coefficients.length) {
      throw new Error(
        `Feature count (${features.length}) must match coefficient count (${coefficients.length})`,
      );
    }
  }

  predict(context: PredictionContext): ProbabilityDistribution {
    const values = this.features.map((f) => f.extract(context.world));
    const mean =
      this.intercept +
      values.reduce((sum, v, i) => sum + v * this.coefficients[i], 0);

    return normalDistribution(mean, this.residualStd, this.accuracy, this.id);
  }
}
