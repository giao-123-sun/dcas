// ============================================================
// Gradient Boosted Trees Prediction Model
// Uses ml-random-forest (tree ensemble) as the backbone
// ============================================================

import { RandomForestRegression } from "ml-random-forest";
import type { PredictionContext, PredictionModel, ProbabilityDistribution } from "../types.js";
import { normalDistribution } from "../distribution.js";
import type { WorldGraph } from "../../world-model/graph.js";

/**
 * A feature extractor: pulls a numeric value from the world model.
 */
export interface GBFeature {
  name: string;
  extract: (world: WorldGraph) => number;
}

/**
 * A training sample: feature values + target value.
 */
export interface TrainingSample {
  features: number[];
  target: number;
}

/**
 * Configuration for the gradient boosted model.
 */
export interface GradientBoostConfig {
  /** Number of trees in the ensemble */
  nEstimators?: number;
  /** Max depth of each tree */
  maxDepth?: number;
  /** Minimum samples per leaf */
  minSamplesLeaf?: number;
  /** Random seed for reproducibility */
  seed?: number;
}

const DEFAULT_CONFIG: Required<GradientBoostConfig> = {
  nEstimators: 100,
  maxDepth: 5,
  minSamplesLeaf: 2,
  seed: 42,
};

/**
 * Tree ensemble prediction model backed by RandomForest.
 *
 * Advantages over StatisticalModel:
 * - Captures non-linear relationships automatically
 * - Handles feature interactions without manual engineering
 * - Provides prediction uncertainty from tree disagreement
 *
 * Usage:
 *   1. Define features (extractors from WorldGraph)
 *   2. Train with historical data (samples)
 *   3. Predict → returns ProbabilityDistribution
 */
export class GradientBoostModel implements PredictionModel {
  readonly type = "statistical" as const;

  private model: RandomForestRegression | null = null;
  private config: Required<GradientBoostConfig>;
  private trainingSamples: TrainingSample[] = [];

  constructor(
    readonly id: string,
    readonly targetProperty: string,
    private features: GBFeature[],
    config?: GradientBoostConfig,
    public accuracy: number = 0.75,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add training samples. Call train() after adding all samples.
   */
  addSamples(samples: TrainingSample[]): void {
    this.trainingSamples.push(...samples);
  }

  /**
   * Train the model on accumulated samples.
   * Requires at least 5 samples.
   */
  train(): void {
    if (this.trainingSamples.length < 5) {
      throw new Error(
        `Need at least 5 training samples, got ${this.trainingSamples.length}`,
      );
    }

    const X = this.trainingSamples.map((s) => s.features);
    const y = this.trainingSamples.map((s) => s.target);

    this.model = new RandomForestRegression({
      nEstimators: this.config.nEstimators,
      maxFeatures: Math.max(1, Math.floor(this.features.length * 0.8)),
      seed: this.config.seed,
      treeOptions: {
        maxDepth: this.config.maxDepth,
      },
    });

    this.model.train(X, y);
  }

  /**
   * Predict using the trained model.
   * Returns a ProbabilityDistribution with uncertainty estimated
   * from individual tree predictions.
   */
  predict(context: PredictionContext): ProbabilityDistribution {
    if (!this.model) {
      // Not trained yet — return high-uncertainty fallback
      return normalDistribution(0, 10000, 0.1, this.id);
    }

    // Extract features from world
    const featureValues = this.features.map((f) => f.extract(context.world));

    // Get ensemble prediction
    const prediction = this.model.predict([featureValues])[0];

    // Estimate uncertainty from individual tree predictions
    const treePredictions = this.predictFromEachTree(featureValues);
    const std = computeStd(treePredictions, prediction);

    return normalDistribution(prediction, Math.max(std, 0.01), this.accuracy, this.id);
  }

  /**
   * Get feature importance scores.
   * Higher score = more important for prediction.
   */
  getFeatureImportance(): Array<{ name: string; importance: number }> {
    if (!this.model || this.trainingSamples.length < 5) {
      return this.features.map((f) => ({ name: f.name, importance: 0 }));
    }

    // Estimate importance via prediction variance contribution
    // Simple approach: permute each feature and measure prediction change
    const baseX = this.trainingSamples.map((s) => s.features);
    const basePreds = this.model.predict(baseX);
    const baseVariance = computeVariance(basePreds);

    const importances: number[] = [];

    for (let fi = 0; fi < this.features.length; fi++) {
      // Shuffle feature fi
      const permutedX = baseX.map((row) => [...row]);
      const values = permutedX.map((row) => row[fi]);
      // Simple shuffle
      for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [values[i], values[j]] = [values[j], values[i]];
      }
      permutedX.forEach((row, i) => { row[fi] = values[i]; });

      const permPreds = this.model!.predict(permutedX);
      // Importance = how much prediction changes when this feature is shuffled
      const mse = basePreds.reduce(
        (sum: number, p: number, i: number) => sum + (p - permPreds[i]) ** 2,
        0,
      ) / basePreds.length;
      importances.push(mse);
    }

    // Normalize
    const total = importances.reduce((s, v) => s + v, 0) || 1;
    return this.features.map((f, i) => ({
      name: f.name,
      importance: importances[i] / total,
    }));
  }

  /**
   * Get predictions from individual trees for uncertainty estimation.
   */
  private predictFromEachTree(features: number[]): number[] {
    if (!this.model) return [];

    // Access internal estimators
    const estimators = (this.model as any).estimators;
    if (!Array.isArray(estimators)) {
      // Fallback: can't access individual trees
      const pred = this.model.predict([features])[0];
      return [pred];
    }

    return estimators.map((tree: any) => {
      try {
        const pred = tree.predict([features]);
        return Array.isArray(pred) ? pred[0] : pred;
      } catch {
        return this.model!.predict([features])[0];
      }
    });
  }

  /** Whether the model has been trained */
  get isTrained(): boolean {
    return this.model !== null;
  }

  /** Number of training samples */
  get sampleCount(): number {
    return this.trainingSamples.length;
  }

  /** Feature names */
  get featureNames(): string[] {
    return this.features.map((f) => f.name);
  }
}

function computeStd(values: number[], mean: number): number {
  if (values.length <= 1) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function computeVariance(values: number[]): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}
