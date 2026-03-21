// ============================================================
// MetaClaw Feedback Processor
// Extracts learning signals from MetaClaw execution feedback
// ============================================================

import type { MetaClawFeedback } from "./types.js";

export interface LearningSignal {
  type: "recalibrate" | "ontology_suggestion" | "pattern";
  strategyId: string;
  description: string;
  data: Record<string, unknown>;
}

/**
 * Process MetaClaw feedback and extract learning signals for DCAS.
 */
export function processFeedback(feedback: MetaClawFeedback): LearningSignal[] {
  const signals: LearningSignal[] = [];

  // 1. Prediction deviation → model recalibration
  if (feedback.outcome) {
    const deviation = Math.abs(feedback.outcome.deviation);
    if (deviation > 0.1) {
      signals.push({
        type: "recalibrate",
        strategyId: feedback.dcas_strategy_id,
        description: `预测偏差 ${(feedback.outcome.deviation * 100).toFixed(1)}%: ` +
          `预测${feedback.outcome.predicted_value}, 实际${feedback.outcome.actual_value}`,
        data: {
          predicted: feedback.outcome.predicted_value,
          actual: feedback.outcome.actual_value,
          deviation: feedback.outcome.deviation,
          direction: feedback.outcome.deviation > 0 ? "over_predicted" : "under_predicted",
        },
      });
    }
  }

  // 2. MetaClaw new skills → possible world model gaps
  for (const skill of feedback.new_skills_generated) {
    signals.push({
      type: "ontology_suggestion",
      strategyId: feedback.dcas_strategy_id,
      description: `MetaClaw自学习了新技能: "${skill.name}" — 可能暗示世界模型缺少某些要素`,
      data: {
        skill_name: skill.name,
        skill_instruction: skill.instruction,
        source: skill.source,
      },
    });
  }

  // 3. Anomalies → patterns to remember
  for (const anomaly of feedback.anomalies) {
    signals.push({
      type: "pattern",
      strategyId: feedback.dcas_strategy_id,
      description: `异常发现: ${anomaly.description}`,
      data: {
        anomaly_type: anomaly.type,
        possible_cause: anomaly.possible_cause,
      },
    });
  }

  // 4. Low execution quality → strategy may be hard to execute
  if (feedback.execution_summary.avg_reward < 0.5) {
    signals.push({
      type: "pattern",
      strategyId: feedback.dcas_strategy_id,
      description: `执行质量偏低 (avg_reward=${feedback.execution_summary.avg_reward.toFixed(2)})，策略可能难以执行`,
      data: {
        avg_reward: feedback.execution_summary.avg_reward,
        completion_status: feedback.execution_summary.completion_status,
        total_turns: feedback.execution_summary.total_turns,
      },
    });
  }

  return signals;
}
