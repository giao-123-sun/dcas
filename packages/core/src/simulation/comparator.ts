// ============================================================
// DCAS L4: Strategy Comparator — rank multiple strategies
// ============================================================

import type { WorldGraph } from "../world-model/graph.js";
import type { PredictionEngine } from "../prediction/engine.js";
import type { ObjectiveSpec } from "../objective/types.js";
import type { Strategy, RankedStrategies, RankedStrategy, SimulationResult, MonteCarloConfig } from "./types.js";
import { simulateStrategy } from "./simulator.js";

/**
 * Simulate multiple strategies and rank them by objective score.
 */
export async function compareStrategies(
  world: WorldGraph,
  strategies: Strategy[],
  objective: ObjectiveSpec,
  predictionEngine?: PredictionEngine,
  predictProperties?: string[],
  mcConfig?: MonteCarloConfig,
): Promise<RankedStrategies> {
  // Simulate all strategies from the same base world
  const results: SimulationResult[] = await Promise.all(
    strategies.map((s) =>
      simulateStrategy(world, s, objective, predictionEngine, predictProperties, mcConfig),
    ),
  );

  // Sort by objective score (descending) — hard violations go to bottom
  const sorted = results
    .map((r, i) => ({ result: r, strategy: strategies[i] }))
    .sort((a, b) => {
      // Hard violations always rank last
      if (a.result.objectiveResult.hardViolation !== b.result.objectiveResult.hardViolation) {
        return a.result.objectiveResult.hardViolation ? 1 : -1;
      }
      return b.result.objectiveResult.score - a.result.objectiveResult.score;
    });

  const rankings: RankedStrategy[] = sorted.map(({ result, strategy }, i) => ({
    rank: i + 1,
    strategyId: strategy.id,
    strategyName: strategy.name,
    score: result.objectiveResult.score,
    riskProfile: result.riskProfile,
    objectiveResult: result.objectiveResult,
    reasoning: generateReasoning(result, i + 1, sorted.length),
  }));

  return {
    rankings,
    baseSnapshotId: world.snapshotId,
  };
}

function generateReasoning(
  result: SimulationResult,
  rank: number,
  total: number,
): string {
  const parts: string[] = [];

  if (result.objectiveResult.hardViolation) {
    parts.push("违反硬约束，不推荐");
  } else if (rank === 1) {
    parts.push(`在${total}个候选策略中综合得分最高`);
  } else {
    parts.push(`排名第${rank}/${total}`);
  }

  parts.push(`综合得分 ${result.objectiveResult.score.toFixed(3)}`);

  // Highlight best KPIs
  const kpis = result.objectiveResult.kpiResults
    .sort((a, b) => b.normalizedScore - a.normalizedScore);
  if (kpis.length > 0) {
    parts.push(`最优指标: ${kpis[0].name}(${(kpis[0].normalizedScore * 100).toFixed(0)}%)`);
  }

  if (result.objectiveResult.softViolations > 0) {
    parts.push(`${result.objectiveResult.softViolations}项软约束告警`);
  }

  return parts.join("；");
}

/**
 * Get detailed simulation results for all strategies (not just rankings).
 */
export async function simulateAll(
  world: WorldGraph,
  strategies: Strategy[],
  objective: ObjectiveSpec,
  predictionEngine?: PredictionEngine,
  predictProperties?: string[],
  mcConfig?: MonteCarloConfig,
): Promise<SimulationResult[]> {
  return Promise.all(
    strategies.map((s) =>
      simulateStrategy(world, s, objective, predictionEngine, predictProperties, mcConfig),
    ),
  );
}
