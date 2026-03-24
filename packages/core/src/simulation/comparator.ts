// ============================================================
// DCAS L4: Strategy Comparator — rank multiple strategies
// ============================================================

import type { WorldGraph } from "../world-model/graph.js";
import type { PredictionEngine } from "../prediction/engine.js";
import type { ObjectiveSpec } from "../objective/types.js";
import type { Strategy, RankedStrategies, RankedStrategy, SimulationResult, MonteCarloConfig } from "./types.js";
import { simulateStrategy } from "./simulator.js";
import { getLocale } from "../i18n/index.js";

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
  const t = getLocale().comparator;

  if (result.objectiveResult.kpiResults.length === 0) {
    return rank === 1 ? t.topRanked(total) : t.ranked(rank, total);
  }

  const parts: string[] = [];

  if (result.objectiveResult.hardViolation) {
    parts.push(t.hardViolation);
  } else if (rank === 1) {
    parts.push(t.topRanked(total));
  } else {
    parts.push(t.ranked(rank, total));
  }

  parts.push(t.compositeScore(result.objectiveResult.score.toFixed(3)));

  // Highlight best KPIs
  const kpis = result.objectiveResult.kpiResults
    .sort((a, b) => b.normalizedScore - a.normalizedScore);
  if (kpis.length > 0) {
    parts.push(t.bestMetric(kpis[0].name, (kpis[0].normalizedScore * 100).toFixed(0)));
  }

  if (result.objectiveResult.softViolations > 0) {
    parts.push(t.softViolations(result.objectiveResult.softViolations));
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
