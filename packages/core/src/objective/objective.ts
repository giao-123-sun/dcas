// ============================================================
// DCAS L2: Objective Function — Evaluation Engine
// ============================================================

import type { WorldGraph } from "../world-model/graph.js";
import type {
  Constraint,
  ConstraintResult,
  KPI,
  KPIResult,
  ObjectiveResult,
  ObjectiveSpec,
  Tradeoff,
} from "./types.js";
import type { DCASConfig } from "../config.js";
import { DEFAULT_CONFIG } from "../config.js";

/**
 * Normalize a KPI value to [0, 1] based on direction and optional target.
 *
 * - maximize: score = value / target (capped at 1), or raw ratio if no target
 * - minimize: score = 1 - value / target (floored at 0), or 1 / (1 + value) if no target
 */
function normalizeKPI(kpi: KPI, value: number): number {
  if (kpi.direction === "maximize") {
    if (kpi.target != null && kpi.target > 0) {
      return Math.min(value / kpi.target, 1);
    }
    // Without target, use sigmoid-like normalization
    return value / (1 + Math.abs(value));
  } else {
    // minimize
    if (kpi.target != null && kpi.target > 0) {
      return Math.max(1 - value / kpi.target, 0);
    }
    return 1 / (1 + Math.abs(value));
  }
}

/**
 * Evaluate a single KPI against the world model.
 */
function evaluateKPI(kpi: KPI, world: WorldGraph): KPIResult {
  const value = kpi.compute(world);
  const normalizedScore = normalizeKPI(kpi, value);
  const alert =
    kpi.threshold != null
      ? kpi.direction === "maximize"
        ? value < kpi.threshold
        : value > kpi.threshold
      : false;

  return {
    kpiId: kpi.id,
    name: kpi.name,
    direction: kpi.direction,
    weight: kpi.weight,
    value,
    normalizedScore,
    alert,
  };
}

/**
 * Evaluate a constraint against the world model.
 */
function evaluateConstraint(constraint: Constraint, world: WorldGraph): ConstraintResult {
  return {
    constraintId: constraint.id,
    description: constraint.description,
    severity: constraint.severity,
    satisfied: constraint.check(world),
  };
}

/**
 * Apply tradeoff adjustments to KPI scores.
 * When two KPIs have a tradeoff preference, boost the preferred one slightly.
 */
function applyTradeoffs(results: KPIResult[], tradeoffs: Tradeoff[], config: DCASConfig = DEFAULT_CONFIG): KPIResult[] {
  if (tradeoffs.length === 0) return results;

  const adjusted = results.map((r) => ({ ...r }));
  const byId = new Map(adjusted.map((r) => [r.kpiId, r]));

  for (const t of tradeoffs) {
    const a = byId.get(t.kpiA);
    const b = byId.get(t.kpiB);
    if (!a || !b) continue;

    // Shift weight slightly based on preference
    const shift = t.preference * config.objective.maxTradeoffShift;
    a.weight = Math.max(0, Math.min(1, a.weight + shift));
    b.weight = Math.max(0, Math.min(1, b.weight - shift));
  }

  // Re-normalize weights to sum to 1
  const totalWeight = adjusted.reduce((s, r) => s + r.weight, 0);
  if (totalWeight > 0) {
    for (const r of adjusted) {
      r.weight = r.weight / totalWeight;
    }
  }

  return adjusted;
}

/**
 * Evaluate the complete objective function against a world state.
 */
export function evaluateObjective(spec: ObjectiveSpec, world: WorldGraph, config?: DCASConfig): ObjectiveResult {
  const cfg = config ?? DEFAULT_CONFIG;

  // Evaluate all KPIs
  let kpiResults = spec.kpis.map((kpi) => evaluateKPI(kpi, world));

  // Apply tradeoff adjustments
  kpiResults = applyTradeoffs(kpiResults, spec.tradeoffs, cfg);

  // Evaluate all constraints
  const constraintResults = spec.constraints.map((c) => evaluateConstraint(c, world));

  // Compute composite score
  const score = kpiResults.reduce(
    (sum, r) => sum + r.normalizedScore * r.weight,
    0,
  );

  const hardViolation = constraintResults.some(
    (c) => c.severity === "hard" && !c.satisfied,
  );

  const softViolations = constraintResults.filter(
    (c) => c.severity === "soft" && !c.satisfied,
  ).length;

  const alerts = kpiResults.filter((r) => r.alert).map((r) => r.kpiId);

  return {
    // If hard constraint violated, score is 0
    score: hardViolation ? 0 : score,
    kpiResults,
    constraintResults,
    hardViolation,
    softViolations,
    alerts,
  };
}

/**
 * Compare two world states using the same objective function.
 * Returns positive if worldA is better, negative if worldB is better.
 */
export function compareWorlds(
  spec: ObjectiveSpec,
  worldA: WorldGraph,
  worldB: WorldGraph,
  config?: DCASConfig,
): { delta: number; resultA: ObjectiveResult; resultB: ObjectiveResult } {
  const resultA = evaluateObjective(spec, worldA, config);
  const resultB = evaluateObjective(spec, worldB, config);
  return {
    delta: resultA.score - resultB.score,
    resultA,
    resultB,
  };
}
