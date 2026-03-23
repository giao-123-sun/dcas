// ============================================================
// Heuristic Prediction Model — rule-based predictions
// ============================================================

import type { PredictionContext, PredictionModel, ProbabilityDistribution } from "../types.js";
import { normalDistribution } from "../distribution.js";

/**
 * A single heuristic rule: if condition matches, produce a prediction.
 */
export interface HeuristicRule {
  /** Human-readable description */
  description: string;
  /** Check if this rule applies to the current context */
  condition: (ctx: PredictionContext) => boolean;
  /** Produce prediction parameters */
  predict: (ctx: PredictionContext) => { mean: number; std: number; confidence: number };
}

/**
 * Rule-based prediction model.
 * Evaluates rules in order, uses first matching rule.
 * Good for domain expert knowledge that doesn't need training data.
 */
export class HeuristicModel implements PredictionModel {
  readonly type = "heuristic" as const;
  accuracy = 0.6; // default moderate accuracy

  constructor(
    readonly id: string,
    readonly targetProperty: string,
    private rules: HeuristicRule[],
    private fallback: { mean: number; std: number; confidence: number },
  ) {}

  async predict(context: PredictionContext): Promise<ProbabilityDistribution> {
    for (const rule of this.rules) {
      if (rule.condition(context)) {
        const { mean, std, confidence } = rule.predict(context);
        return normalDistribution(mean, std, confidence, this.id);
      }
    }
    // No rule matched, use fallback
    return normalDistribution(
      this.fallback.mean,
      this.fallback.std,
      this.fallback.confidence,
      this.id,
    );
  }

  addRule(rule: HeuristicRule): void {
    this.rules.push(rule);
  }
}
