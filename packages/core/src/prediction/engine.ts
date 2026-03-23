// ============================================================
// DCAS L3: Prediction Engine — orchestrates multiple models
// ============================================================

import type { WorldGraph } from "../world-model/graph.js";
import type {
  EnsemblePrediction,
  PredictionAction,
  PredictionModel,
  ProbabilityDistribution,
} from "./types.js";
import { ensembleDistributions } from "./distribution.js";
import type { DCASConfig } from "../config.js";
import { DEFAULT_CONFIG } from "../config.js";

export class PredictionEngine {
  private models = new Map<string, PredictionModel>();
  private config: DCASConfig;

  constructor(config?: DCASConfig) {
    this.config = config ?? DEFAULT_CONFIG;
  }

  registerModel(model: PredictionModel): void {
    this.models.set(model.id, model);
  }

  removeModel(id: string): boolean {
    return this.models.delete(id);
  }

  getModel(id: string): PredictionModel | undefined {
    return this.models.get(id);
  }

  /**
   * Get all models that predict a specific property.
   */
  getModelsForProperty(targetProperty: string): PredictionModel[] {
    return [...this.models.values()].filter(
      (m) => m.targetProperty === targetProperty,
    );
  }

  /**
   * Single-model prediction.
   */
  async predict(
    modelId: string,
    world: WorldGraph,
    targetProperty: string,
    action?: PredictionAction,
  ): Promise<ProbabilityDistribution> {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }
    return model.predict({ world, targetProperty, action });
  }

  /**
   * Ensemble prediction: run all models for a target property,
   * combine results weighted by accuracy/confidence.
   */
  async ensemble(
    world: WorldGraph,
    targetProperty: string,
    action?: PredictionAction,
  ): Promise<EnsemblePrediction> {
    const models = this.getModelsForProperty(targetProperty);
    if (models.length === 0) {
      throw new Error(`No models registered for property: ${targetProperty}`);
    }

    const individual = await Promise.all(
      models.map((m) => m.predict({ world, targetProperty, action })),
    );

    const combined = ensembleDistributions(individual);

    return {
      combined,
      individual,
      modelIds: models.map((m) => m.id),
    };
  }

  /**
   * Predict multiple properties at once.
   */
  async predictAll(
    world: WorldGraph,
    targetProperties: string[],
    action?: PredictionAction,
  ): Promise<Map<string, EnsemblePrediction>> {
    const results = new Map<string, EnsemblePrediction>();
    for (const prop of targetProperties) {
      const models = this.getModelsForProperty(prop);
      if (models.length === 0) continue;
      results.set(prop, await this.ensemble(world, prop, action));
    }
    return results;
  }

  /**
   * Recalibrate a model's accuracy based on observed deviation.
   * Called by L5 Memory & Learning when actual outcomes arrive.
   */
  recalibrate(modelId: string, observedDeviation: number): void {
    const model = this.models.get(modelId);
    if (!model) return;

    // Simple exponential moving average of accuracy
    const error = Math.min(Math.abs(observedDeviation), 1);
    const newAccuracy = 1 - error;
    const emaWeight = this.config.prediction.recalibrateEmaWeight;
    model.accuracy = model.accuracy * emaWeight + newAccuracy * (1 - emaWeight);
  }
}
