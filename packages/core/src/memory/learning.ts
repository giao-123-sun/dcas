// ============================================================
// DCAS L5: Learning Loop — analyze outcomes, generate updates
// ============================================================

import type { DecisionRecord, LearningUpdate } from "./types.js";
import type { PatternMemory } from "./pattern.js";
import type { DCASConfig } from "../config.js";
import { DEFAULT_CONFIG } from "../config.js";

/**
 * Analyze a decision outcome and generate learning updates.
 *
 * This is the core learning loop:
 * 1. Compare predicted KPI values with actual values
 * 2. If accurate → increase model confidence
 * 3. If significant deviation → analyze cause and generate recalibration
 * 4. Extract patterns from multiple outcomes
 */
export function learnFromOutcome(
  record: DecisionRecord,
  patternMemory: PatternMemory,
  config?: DCASConfig,
): LearningUpdate[] {
  const cfg = config ?? DEFAULT_CONFIG;
  const SMALL_DEVIATION = cfg.learning.smallDeviationThreshold;
  const LARGE_DEVIATION = cfg.learning.largeDeviationThreshold;
  const updates: LearningUpdate[] = [];

  if (!record.outcome) return updates;

  const deviations = record.outcome.deviations;

  for (const [kpi, deviation] of Object.entries(deviations)) {
    const absDev = Math.abs(deviation);

    if (absDev < SMALL_DEVIATION) {
      // Prediction was accurate → boost confidence
      updates.push({
        type: "confidence_up",
        target: kpi,
        data: { deviation, absDev },
        reason: `KPI "${kpi}" 预测准确 (偏差${(deviation * 100).toFixed(1)}%)`,
      });
    } else if (absDev > LARGE_DEVIATION) {
      // Significant miss → recalibrate
      updates.push({
        type: "recalibrate",
        target: kpi,
        data: {
          deviation,
          predicted: record.objectiveSummary.kpiValues[kpi],
          actual: record.outcome!.actualKPIValues[kpi],
          strategy: record.chosenStrategyId,
        },
        reason: `KPI "${kpi}" 预测偏差过大 (${(deviation * 100).toFixed(1)}%)，需要校准模型`,
      });
    }
  }

  // Extract patterns from unexpected effects
  if (record.outcome.unexpectedEffects.length > 0) {
    for (const effect of record.outcome.unexpectedEffects) {
      updates.push({
        type: "ontology_suggestion",
        target: "world_model",
        data: { effect, strategyId: record.chosenStrategyId },
        reason: `意外效应: "${effect}" — 可能需要扩展世界模型`,
      });

      // Add to pattern memory
      patternMemory.addPattern({
        description: `策略 ${record.chosenStrategyId} 产生意外效应: ${effect}`,
        condition: {
          strategyTypes: [record.chosenStrategyId],
          entityTypes: record.worldSnapshot.entitySummaries.map((e) => e.type),
        },
        observation: effect,
        confidence: 0.4, // Low initial confidence
        exampleDecisionId: record.id,
      });
    }
  }

  // Analyze overall strategy performance
  const avgDeviation = Object.values(deviations).reduce(
    (sum, d) => sum + Math.abs(d), 0,
  ) / Math.max(Object.values(deviations).length, 1);

  if (avgDeviation < SMALL_DEVIATION) {
    // Strategy worked as predicted
    patternMemory.addPattern({
      description: `策略 ${record.chosenStrategyId} 在此类场景下表现符合预期`,
      condition: {
        strategyTypes: [record.chosenStrategyId],
        entityTypes: record.worldSnapshot.entitySummaries.map((e) => e.type),
      },
      observation: `平均偏差 ${(avgDeviation * 100).toFixed(1)}%`,
      confidence: 0.6,
      exampleDecisionId: record.id,
    });
  }

  return updates;
}

/**
 * Batch analyze multiple outcomes to find systematic patterns.
 */
export function analyzeDecisionHistory(
  records: DecisionRecord[],
  patternMemory: PatternMemory,
  config?: DCASConfig,
): LearningUpdate[] {
  const cfg = config ?? DEFAULT_CONFIG;
  const SMALL_DEVIATION = cfg.learning.smallDeviationThreshold;
  const withOutcomes = records.filter((r) => r.outcome != null);
  if (withOutcomes.length < 3) return [];

  const updates: LearningUpdate[] = [];

  // Group by strategy
  const byStrategy = new Map<string, DecisionRecord[]>();
  for (const r of withOutcomes) {
    if (!byStrategy.has(r.chosenStrategyId)) {
      byStrategy.set(r.chosenStrategyId, []);
    }
    byStrategy.get(r.chosenStrategyId)!.push(r);
  }

  for (const [strategyId, recs] of byStrategy) {
    if (recs.length < 2) continue;

    // Check for systematic bias in predictions
    for (const kpi of recs[0].objectiveSummary.kpiIds) {
      const deviations = recs
        .filter((r) => r.outcome!.deviations[kpi] != null)
        .map((r) => r.outcome!.deviations[kpi]);

      if (deviations.length < 2) continue;

      const meanDev = deviations.reduce((s, d) => s + d, 0) / deviations.length;

      // Systematic bias: most deviations in the same direction
      const sameSign = deviations.filter((d) => Math.sign(d) === Math.sign(meanDev));
      if (sameSign.length >= deviations.length * cfg.learning.biasDirectionThreshold && Math.abs(meanDev) > SMALL_DEVIATION) {
        const direction = meanDev > 0 ? "系统性高估" : "系统性低估";
        updates.push({
          type: "recalibrate",
          target: kpi,
          data: {
            bias: meanDev,
            sampleSize: deviations.length,
            strategy: strategyId,
          },
          reason: `策略 "${strategyId}" 的 KPI "${kpi}" 存在${direction} (平均偏差 ${(meanDev * 100).toFixed(1)}%, 样本数${deviations.length})`,
        });

        patternMemory.addPattern({
          description: `策略 ${strategyId} 对 ${kpi} 存在${direction}`,
          condition: { strategyTypes: [strategyId] },
          observation: `平均偏差 ${(meanDev * 100).toFixed(1)}%`,
          confidence: Math.min(0.9, 0.5 + deviations.length * 0.05),
          exampleDecisionId: recs[recs.length - 1].id,
        });
      }
    }
  }

  return updates;
}
