import type { PredictionContext, PredictionModel, ProbabilityDistribution } from "../types.js";
import { normalDistribution } from "../distribution.js";
import type { LLMClient } from "../../llm/client.js";
import { serializeWorldForLLM } from "../../llm/world-serializer.js";
import type { WorldGraph } from "../../world-model/graph.js";
import type { Action } from "../../simulation/types.js";
import type { EntityId, PropertyValue } from "../../world-model/types.js";

export interface AdversaryProfile {
  entityId: EntityId;
  entityType: string;
  /** Historical behavior patterns */
  behaviors: Array<{
    situation: string;
    response: string;
    probability: number;
  }>;
  /** Default response tendency */
  defaultTendency: { mean: number; std: number };
}

/**
 * Adversary prediction model — predicts opponent behavior.
 * Uses historical behavior patterns and optionally LLM reasoning.
 */
export class AdversaryModel implements PredictionModel {
  readonly type = "adversary" as const;

  constructor(
    readonly id: string,
    readonly targetProperty: string,
    private profile: AdversaryProfile,
    private llmClient?: LLMClient,
    public accuracy: number = 0.55,
  ) {}

  async predict(context: PredictionContext): Promise<ProbabilityDistribution> {
    // If we have an action context, try to match against known behaviors
    if (context.action) {
      for (const behavior of this.profile.behaviors) {
        if (context.action.type === behavior.situation ||
            context.action.description.includes(behavior.situation)) {
          // Found matching historical behavior
          return normalDistribution(
            this.profile.defaultTendency.mean * behavior.probability,
            this.profile.defaultTendency.std,
            Math.min(this.accuracy + 0.1, 0.9),
            this.id,
          );
        }
      }
    }

    // Try LLM if available
    if (this.llmClient) {
      return this.predictWithLLM(context);
    }

    // Fallback to default tendency
    return normalDistribution(
      this.profile.defaultTendency.mean,
      this.profile.defaultTendency.std,
      this.accuracy,
      this.id,
    );
  }

  /**
   * Predict specific opponent actions (not just a distribution).
   * Returns possible actions with probabilities.
   */
  async predictActions(
    world: WorldGraph,
    ourAction: Action,
  ): Promise<Array<{ action: Action; probability: number }>> {
    // Map behaviors to concrete actions
    const actions: Array<{ action: Action; probability: number }> = [];
    let totalProb = 0;

    for (const behavior of this.profile.behaviors) {
      actions.push({
        action: {
          description: behavior.response,
          entityId: this.profile.entityId,
          property: this.targetProperty,
          value: behavior.response as PropertyValue,
        },
        probability: behavior.probability,
      });
      totalProb += behavior.probability;
    }

    // Normalize probabilities
    if (totalProb > 0) {
      for (const a of actions) {
        a.probability /= totalProb;
      }
    }

    return actions;
  }

  private async predictWithLLM(context: PredictionContext): Promise<ProbabilityDistribution> {
    if (!this.llmClient) {
      return normalDistribution(
        this.profile.defaultTendency.mean,
        this.profile.defaultTendency.std,
        this.accuracy,
        this.id,
      );
    }

    const worldText = serializeWorldForLLM(context.world);
    const actionText = context.action
      ? `我方行动: ${context.action.description}`
      : "无特定行动";

    const prompt = `你是对手方的法律顾问。根据以下情况预测对手的反应。

${worldText}

${actionText}

对手画像:
- 类型: ${this.profile.entityType}
- 历史行为模式: ${this.profile.behaviors.map(b => `${b.situation}→${b.response}(${(b.probability*100).toFixed(0)}%)`).join(', ')}

请预测对手在 "${this.targetProperty}" 方面的反应值。
返回JSON: { "mean": <数值>, "std": <不确定性>, "confidence": <0-1>, "reasoning": "<推理>" }`;

    try {
      const result = await this.llmClient.chatJSON<{ mean: number; std: number; confidence: number }>(
        [{ role: "user", content: prompt }],
      );
      return normalDistribution(
        result.mean,
        Math.max(result.std, 0.01),
        Math.min(result.confidence, 0.8),
        this.id,
      );
    } catch {
      return normalDistribution(
        this.profile.defaultTendency.mean,
        this.profile.defaultTendency.std,
        this.accuracy * 0.5,
        this.id,
      );
    }
  }
}
