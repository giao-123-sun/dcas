// ============================================================
// LLM Prediction Model — uses Gemini to predict outcomes
// ============================================================

import type { PredictionContext, PredictionModel, ProbabilityDistribution } from "../types.js";
import { normalDistribution } from "../distribution.js";
import type { LLMClient } from "../../llm/client.js";
import { serializeWorldForLLM } from "../../llm/world-serializer.js";

interface LLMPredictionResponse {
  mean: number;
  std: number;
  confidence: number;
  reasoning: string;
}

/**
 * LLM-based prediction model.
 *
 * Serializes the world state into a prompt, asks Gemini to predict
 * a specific property, and parses the structured JSON response.
 *
 * Best for: complex predictions where rule-based and statistical models
 * lack sufficient data or the domain is too nuanced for simple formulas.
 */
export class LLMPredictionModel implements PredictionModel {
  readonly type = "llm" as const;
  accuracy = 0.65; // start conservative

  constructor(
    readonly id: string,
    readonly targetProperty: string,
    private client: LLMClient,
    private domainContext: string,
  ) {}

  async predict(context: PredictionContext): Promise<ProbabilityDistribution> {
    const worldText = serializeWorldForLLM(context.world);
    const actionText = context.action
      ? `\n假设动作: ${context.action.description} (参数: ${JSON.stringify(context.action.parameters)})`
      : "";

    const prompt = `${this.domainContext}

${worldText}
${actionText}

请预测属性 "${context.targetProperty}" 的值。

要求:
1. 基于上述世界状态和领域知识进行推理
2. 给出预测的均值(mean)、标准差(std)和置信度(confidence, 0-1)
3. 简要说明推理过程

返回JSON格式:
{
  "mean": <数值>,
  "std": <数值，表示不确定性>,
  "confidence": <0到1之间>,
  "reasoning": "<一句话说明为什么这么预测>"
}`;

    try {
      const result = await this.client.chatJSON<LLMPredictionResponse>([
        { role: "user", content: prompt },
      ]);

      return normalDistribution(
        result.mean,
        Math.max(result.std, 0.01), // prevent zero std
        Math.min(Math.max(result.confidence, 0.1), 1),
        this.id,
      );
    } catch (e) {
      console.warn(`[${this.id}] prediction failed, using fallback:`, e instanceof Error ? e.message : e);
      // Fallback on LLM failure: wide uncertainty
      return normalDistribution(0, 10000, 0.1, this.id);
    }
  }
}
