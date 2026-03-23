// ============================================================
// DCAS L4: Strategy Simulator
// ============================================================

import type { WorldGraph } from "../world-model/graph.js";
import type { PropertyDiff } from "../world-model/types.js";
import type { PredictionEngine } from "../prediction/engine.js";
import type { ProbabilityDistribution } from "../prediction/types.js";
import type { ObjectiveSpec, ObjectiveResult } from "../objective/types.js";
import { evaluateObjective } from "../objective/objective.js";
import { forkGraph } from "../world-model/fork.js";
import type { Strategy, SimulationResult, RiskProfile } from "./types.js";
import type { DCASConfig } from "../config.js";
import { DEFAULT_CONFIG } from "../config.js";

/**
 * Simulate a strategy by:
 * 1. Fork the world
 * 2. Apply actions step by step
 * 3. Evaluate conditionals after each step
 * 4. Run predictions at each step
 * 5. Evaluate objective at the end
 * 6. Compute risk profile from predictions
 */
export function simulateStrategy(
  world: WorldGraph,
  strategy: Strategy,
  objective: ObjectiveSpec,
  predictionEngine?: PredictionEngine,
  predictProperties?: string[],
  config?: DCASConfig,
): SimulationResult {
  const fork = forkGraph(world, strategy.name);
  const allDiffs: PropertyDiff[] = [];
  const stepPredictions: Map<string, ProbabilityDistribution>[] = [];
  const reasoning: string[] = [];

  reasoning.push(`开始模拟策略: ${strategy.name}`);

  // Execute actions step by step
  for (let step = 0; step < strategy.actions.length; step++) {
    const action = strategy.actions[step];

    // Apply the action
    const entity = fork.getEntity(action.entityId);
    if (!entity) {
      reasoning.push(`步骤${step + 1}: 实体 ${action.entityId} 不存在，跳过`);
      continue;
    }

    const result = fork.updateProperty(action.entityId, action.property, action.value);
    allDiffs.push(...result.diffs);

    reasoning.push(
      `步骤${step + 1}: ${action.description} → ` +
      `直接变更${result.diffs.length > 0 ? 1 : 0}项，级联传播${result.cascadeCount}项`,
    );

    // Evaluate conditionals
    if (strategy.conditionals) {
      for (const cond of strategy.conditionals) {
        if (cond.condition(fork)) {
          const condEntity = fork.getEntity(cond.action.entityId);
          if (condEntity) {
            const condResult = fork.updateProperty(
              cond.action.entityId,
              cond.action.property,
              cond.action.value,
            );
            allDiffs.push(...condResult.diffs);
            reasoning.push(`  条件触发: ${cond.description}`);
          }
        }
      }
    }

    // Run predictions if engine available
    if (predictionEngine && predictProperties && predictProperties.length > 0) {
      const preds = predictionEngine.predictAll(fork, predictProperties);
      stepPredictions.push(preds.get(predictProperties[0])
        ? new Map([...preds].map(([k, v]) => [k, v.combined]))
        : new Map(),
      );
    } else {
      stepPredictions.push(new Map());
    }
  }

  // Final objective evaluation
  const objectiveResult = evaluateObjective(objective, fork);
  reasoning.push(
    `最终得分: ${objectiveResult.score.toFixed(3)}` +
    (objectiveResult.hardViolation ? " (硬约束违反!)" : "") +
    (objectiveResult.alerts.length > 0 ? ` 告警: ${objectiveResult.alerts.join(", ")}` : ""),
  );

  // Compute risk profile from the primary KPI's prediction (if available)
  const cfg = config ?? DEFAULT_CONFIG;
  const riskProfile = computeRiskProfile(objectiveResult, stepPredictions, cfg);

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    forkedWorld: fork,
    diffs: allDiffs,
    stepPredictions,
    objectiveResult,
    riskProfile,
    reasoningChain: reasoning,
  };
}

function computeRiskProfile(
  objectiveResult: ObjectiveResult,
  stepPredictions: Map<string, ProbabilityDistribution>[],
  config: DCASConfig = DEFAULT_CONFIG,
): RiskProfile {
  // If we have predictions from the last step, use them
  const lastStep = stepPredictions[stepPredictions.length - 1];
  if (lastStep && lastStep.size > 0) {
    const firstPred = [...lastStep.values()][0];
    return {
      bestCase: firstPred.percentiles.p95,
      expectedCase: firstPred.mean,
      worstCase: firstPred.percentiles.p5,
    };
  }

  // Fallback: derive from objective score
  const score = objectiveResult.score;
  return {
    bestCase: Math.min(score * config.simulation.riskBestCaseMultiplier, 1),
    expectedCase: score,
    worstCase: score * config.simulation.riskWorstCaseMultiplier,
  };
}
