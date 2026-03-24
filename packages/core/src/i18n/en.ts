import type { Locale } from "./zh.js";

/**
 * English locale strings for DCAS core engine.
 */
export const en: Locale = {
  simulation: {
    startSimulation: (name) => `Starting simulation: ${name}`,
    entityNotFound: (step, id) => `Step ${step}: Entity ${id} not found, skipping`,
    stepResult: (step, desc, directCount, cascadeCount) =>
      `Step ${step}: ${desc} → ${directCount} direct change(s), ${cascadeCount} cascade(s)`,
    conditionalTriggered: (desc) => `  Condition triggered: ${desc}`,
    finalScore: (score, hardViolation, alerts) =>
      `Final score: ${score}${hardViolation ? " (hard constraint violated!)" : ""}${alerts.length > 0 ? ` Alerts: ${alerts.join(", ")}` : ""}`,
  },
  comparator: {
    topRanked: (total) => `Top ranked among ${total} candidate strategies`,
    ranked: (rank, total) => `Ranked #${rank}/${total}`,
    hardViolation: "Hard constraint violated, not recommended",
    compositeScore: (score) => `Composite score ${score}`,
    bestMetric: (name, pct) => `Best metric: ${name}(${pct}%)`,
    softViolations: (count) => `${count} soft constraint warning(s)`,
  },
  controller: {
    autoExecute: (name, score, worst) =>
      `Auto-execute: ${name} (score ${score}, worst-case ${worst})`,
    recommend: (name, score, alertCount) =>
      `Recommend: ${name} (score ${score})${alertCount > 0 ? `, ${alertCount} KPI alert(s)` : ""}`,
  },
  learning: {
    accuratePrediction: (kpi, pct) => `KPI "${kpi}" prediction accurate (deviation ${pct}%)`,
    largeBias: (kpi, pct) => `KPI "${kpi}" prediction deviation too large (${pct}%), model recalibration needed`,
    unexpectedEffect: (effect) => `Unexpected effect: "${effect}" — may need world model extension`,
    strategyUnexpected: (stratId, effect) => `Strategy ${stratId} produced unexpected effect: ${effect}`,
    strategyMatchedExpected: (stratId) => `Strategy ${stratId} performed as expected in this scenario`,
    avgDeviation: (pct) => `Average deviation ${pct}%`,
    systematicOverestimate: "systematic overestimate",
    systematicUnderestimate: "systematic underestimate",
    systematicBias: (stratId, kpi, dir, pct, n) =>
      `Strategy "${stratId}" KPI "${kpi}" shows ${dir} (avg deviation ${pct}%, samples: ${n})`,
    strategyBiasPattern: (stratId, kpi, dir) => `Strategy ${stratId} on ${kpi}: ${dir}`,
  },
  feedback: {
    predictionDeviation: (pct, predicted, actual) =>
      `Prediction deviation ${pct}%: predicted ${predicted}, actual ${actual}`,
    newSkillHint: (name) =>
      `MetaClaw self-learned skill: "${name}" — may indicate world model gaps`,
    anomalyFound: (desc) => `Anomaly detected: ${desc}`,
    lowQuality: (reward) => `Low execution quality (avg_reward=${reward}), strategy may be hard to execute`,
  },
  translator: {
    goalSection: "## Goal",
    strategySection: "## Strategy",
    constraintSection: "## Constraints",
    contextSection: "## Context",
    defaultGoal: "Optimize composite metric",
    defaultAction: "1. Execute according to simulation results",
    defaultConstraint: "- Respect all hard constraints",
    kpiLine: (name, value, pct) => `- ${name}: current ${value}, target score ${pct}%`,
    actionLine: (i, prop, old, val) => `${i}. Change ${prop} from ${old} to ${val}`,
    rankInfo: (rank) => `- This strategy ranks #${rank} among candidates`,
    riskInfo: (best, expected, worst) => `- Risk: best ${best}, expected ${expected}, worst ${worst}`,
  },
  serializer: {
    worldState: "## World State",
    entityCount: (type, count) => `### ${type} (${count})`,
    relations: "### Relations",
    objectiveFunction: "## Objective Function",
    kpiMetrics: "### KPI Metrics",
    kpiLine: (name, id, dir, weight, target?) =>
      `- ${name} (${id}): ${dir}, weight ${weight}%${target ? `, target ${target}` : ""}`,
    constraints: "### Constraints",
  },
};
