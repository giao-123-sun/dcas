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
import type { Strategy, SimulationResult, RiskProfile, MonteCarloConfig } from "./types.js";
import type { DCASConfig } from "../config.js";
import { DEFAULT_CONFIG } from "../config.js";
import { getLocale } from "../i18n/index.js";
import {
  sampleFromDistribution,
  createSeededRng,
  empiricalDistribution,
  coefficientOfVariation,
} from "../prediction/sampler.js";

/**
 * Simulate a strategy by:
 * 1. Fork the world
 * 2. Apply actions step by step
 * 3. Evaluate conditionals after each step
 * 4. Run predictions at each step
 * 5. Evaluate objective at the end
 * 6. Compute risk profile from predictions
 *
 * If mcConfig.runs > 1, runs a Monte Carlo simulation over N trials.
 */
export async function simulateStrategy(
  world: WorldGraph,
  strategy: Strategy,
  objective: ObjectiveSpec,
  predictionEngine?: PredictionEngine,
  predictProperties?: string[],
  mcConfig?: MonteCarloConfig,
  config?: DCASConfig,
): Promise<SimulationResult> {
  // If no MC config or single run, behave like before
  if (!mcConfig || mcConfig.runs <= 1) {
    return runSingleSimulation(world, strategy, objective, predictionEngine, predictProperties, config);
  }

  // Monte Carlo mode
  return runMonteCarloSimulation(world, strategy, objective, predictionEngine, predictProperties, mcConfig, config);
}

/**
 * Single deterministic simulation run (original behavior).
 */
async function runSingleSimulation(
  world: WorldGraph,
  strategy: Strategy,
  objective: ObjectiveSpec,
  predictionEngine?: PredictionEngine,
  predictProperties?: string[],
  config?: DCASConfig,
): Promise<SimulationResult> {
  const fork = forkGraph(world, strategy.name);
  const allDiffs: PropertyDiff[] = [];
  const stepPredictions: Map<string, ProbabilityDistribution>[] = [];
  const reasoning: string[] = [];

  const t = getLocale().simulation;
  reasoning.push(t.startSimulation(strategy.name));

  // Execute actions step by step
  for (let step = 0; step < strategy.actions.length; step++) {
    const action = strategy.actions[step];

    // Apply the action
    const entity = fork.getEntity(action.entityId);
    if (!entity) {
      reasoning.push(t.entityNotFound(step + 1, action.entityId));
      continue;
    }

    const result = fork.updateProperty(action.entityId, action.property, action.value);
    allDiffs.push(...result.diffs);

    reasoning.push(
      t.stepResult(step + 1, action.description, result.diffs.length > 0 ? 1 : 0, result.cascadeCount),
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
            reasoning.push(t.conditionalTriggered(cond.description));
          }
        }
      }
    }

    // Run predictions if engine available
    if (predictionEngine && predictProperties && predictProperties.length > 0) {
      const preds = await predictionEngine.predictAll(fork, predictProperties);
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
    t.finalScore(objectiveResult.score.toFixed(3), objectiveResult.hardViolation, objectiveResult.alerts),
  );

  // Compute risk profile from the primary KPI's prediction (if available)
  const cfg = config ?? DEFAULT_CONFIG;
  const riskProfile = computeRiskProfile(objectiveResult, stepPredictions, cfg);

  // Build single-run KPI distributions from objective result
  const kpiDistributions = buildKpiDistributionsFromObjective(objectiveResult);

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    forkedWorld: fork,
    diffs: allDiffs,
    stepPredictions,
    objectiveResult,
    riskProfile,
    reasoningChain: reasoning,
    monteCarloRuns: 1,
    kpiDistributions,
    converged: true,
  };
}

/**
 * Monte Carlo simulation: run N trials and aggregate KPI distributions.
 */
async function runMonteCarloSimulation(
  world: WorldGraph,
  strategy: Strategy,
  objective: ObjectiveSpec,
  predictionEngine?: PredictionEngine,
  predictProperties?: string[],
  mcConfig?: MonteCarloConfig,
  config?: DCASConfig,
): Promise<SimulationResult> {
  const cfg = config ?? DEFAULT_CONFIG;
  const runs = mcConfig!.runs;
  const maxSteps = mcConfig!.maxSteps ?? 10;
  const convergenceThreshold = mcConfig!.convergenceThreshold;
  const minRunsBeforeConvergence = mcConfig!.minRunsBeforeConvergence ?? 10;
  const keepPerRunResults = mcConfig!.keepPerRunResults ?? false;

  // Set up seeded RNG if seed provided
  const rng = mcConfig!.seed !== undefined ? createSeededRng(mcConfig!.seed) : Math.random;

  // Accumulators: kpiId -> array of values across runs
  const kpiAccumulators = new Map<string, number[]>();
  const perRunResults: Array<Record<string, number>> = [];

  let firstFork: WorldGraph | null = null;
  let firstDiffs: PropertyDiff[] = [];
  let firstStepPredictions: Map<string, ProbabilityDistribution>[] = [];
  let firstReasoning: string[] = [];
  let lastObjectiveResult: ObjectiveResult | null = null;
  let converged = false;
  let actualRuns = 0;

  for (let run = 0; run < runs; run++) {
    actualRuns = run + 1;
    const fork = forkGraph(world, `${strategy.name}_mc_${run}`);
    const runDiffs: PropertyDiff[] = [];
    const runStepPredictions: Map<string, ProbabilityDistribution>[] = [];
    const runReasoning: string[] = [];

    const tMC = getLocale().simulation;
    runReasoning.push(tMC.startSimulation(strategy.name));

    const actionCount = Math.min(strategy.actions.length, maxSteps);

    for (let step = 0; step < actionCount; step++) {
      const action = strategy.actions[step];

      const entity = fork.getEntity(action.entityId);
      if (!entity) {
        runReasoning.push(tMC.entityNotFound(step + 1, action.entityId));
        continue;
      }

      // Apply base action
      const result = fork.updateProperty(action.entityId, action.property, action.value);
      runDiffs.push(...result.diffs);

      runReasoning.push(
        tMC.stepResult(step + 1, action.description, result.diffs.length > 0 ? 1 : 0, result.cascadeCount),
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
              runDiffs.push(...condResult.diffs);
              runReasoning.push(tMC.conditionalTriggered(cond.description));
            }
          }
        }
      }

      // Run predictions + sample stochastic values
      if (predictionEngine && predictProperties && predictProperties.length > 0) {
        const preds = await predictionEngine.predictAll(fork, predictProperties);
        const stepPredMap = new Map<string, ProbabilityDistribution>();

        for (const [prop, ensembleResult] of preds) {
          const dist = ensembleResult.combined;
          stepPredMap.set(prop, dist);

          // Sample a value from the distribution and apply it to the action's entity
          const sampledValue = sampleFromDistribution(dist, rng);
          const targetEntity = fork.getEntity(action.entityId);
          if (targetEntity && typeof sampledValue === "number") {
            fork.updateProperty(action.entityId, prop, sampledValue);
          }
        }

        runStepPredictions.push(stepPredMap);
      } else {
        runStepPredictions.push(new Map());
      }
    }

    // Final objective evaluation for this run
    const objectiveResult = evaluateObjective(objective, fork);
    runReasoning.push(
      tMC.finalScore(objectiveResult.score.toFixed(3), objectiveResult.hardViolation, objectiveResult.alerts),
    );

    // Collect KPI values
    const runKpis: Record<string, number> = {};
    for (const kpiResult of objectiveResult.kpiResults) {
      const arr = kpiAccumulators.get(kpiResult.kpiId) ?? [];
      arr.push(kpiResult.value);
      kpiAccumulators.set(kpiResult.kpiId, arr);
      runKpis[kpiResult.kpiId] = kpiResult.value;
    }

    if (keepPerRunResults) {
      perRunResults.push(runKpis);
    }

    // Save first run data for final result
    if (run === 0) {
      firstFork = fork;
      firstDiffs = runDiffs;
      firstStepPredictions = runStepPredictions;
      firstReasoning = runReasoning;
      lastObjectiveResult = objectiveResult;
    } else {
      lastObjectiveResult = objectiveResult;
    }

    // Check convergence after minimum runs
    if (
      convergenceThreshold !== undefined &&
      actualRuns >= minRunsBeforeConvergence
    ) {
      let allConverged = true;
      for (const values of kpiAccumulators.values()) {
        const cv = coefficientOfVariation(values);
        if (cv > convergenceThreshold) {
          allConverged = false;
          break;
        }
      }
      if (allConverged) {
        converged = true;
        break;
      }
    }
  }

  // If we finished all runs without early stop, mark converged only if threshold was not set
  if (!converged && convergenceThreshold === undefined) {
    converged = true;
  }

  // Aggregate KPI distributions
  const kpiDistributions = new Map<string, ProbabilityDistribution>();
  for (const [kpiId, values] of kpiAccumulators) {
    kpiDistributions.set(kpiId, empiricalDistribution(values, `mc_${kpiId}`));
  }

  // Compute risk profile from MC distributions or objective
  const riskProfile = computeRiskProfileFromMC(lastObjectiveResult!, kpiDistributions, firstStepPredictions, cfg);

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    forkedWorld: firstFork!,
    diffs: firstDiffs,
    stepPredictions: firstStepPredictions,
    objectiveResult: lastObjectiveResult!,
    riskProfile,
    reasoningChain: firstReasoning,
    monteCarloRuns: actualRuns,
    kpiDistributions,
    perRunResults: keepPerRunResults ? perRunResults : undefined,
    converged,
  };
}

/**
 * Build KPI distributions from a single objective evaluation (degenerate, std=0).
 */
function buildKpiDistributionsFromObjective(
  objectiveResult: ObjectiveResult,
): Map<string, ProbabilityDistribution> {
  const map = new Map<string, ProbabilityDistribution>();
  for (const kpiResult of objectiveResult.kpiResults) {
    map.set(kpiResult.kpiId, empiricalDistribution([kpiResult.value], `single_${kpiResult.kpiId}`));
  }
  return map;
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

function computeRiskProfileFromMC(
  objectiveResult: ObjectiveResult,
  kpiDistributions: Map<string, ProbabilityDistribution>,
  stepPredictions: Map<string, ProbabilityDistribution>[],
  config: DCASConfig = DEFAULT_CONFIG,
): RiskProfile {
  // Try to use the first KPI distribution from MC
  const firstDist = kpiDistributions.size > 0 ? [...kpiDistributions.values()][0] : null;
  if (firstDist && firstDist.std > 0) {
    return {
      bestCase: firstDist.percentiles.p95,
      expectedCase: firstDist.mean,
      worstCase: firstDist.percentiles.p5,
    };
  }
  return computeRiskProfile(objectiveResult, stepPredictions, config);
}
