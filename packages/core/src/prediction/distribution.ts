// ============================================================
// DCAS L3: Probability Distribution utilities
// ============================================================

import type { ProbabilityDistribution } from "./types.js";

/**
 * Create a distribution from mean and standard deviation (normal approximation).
 */
export function normalDistribution(
  mean: number,
  std: number,
  confidence: number,
  modelId: string,
): ProbabilityDistribution {
  return {
    mean,
    median: mean,
    std,
    percentiles: {
      p5: mean - 1.645 * std,
      p25: mean - 0.674 * std,
      p75: mean + 0.674 * std,
      p95: mean + 1.645 * std,
    },
    confidence,
    modelId,
  };
}

/**
 * Create a skewed distribution (e.g., legal outcomes often skewed).
 * skew > 0 means right-skewed (long tail on high side).
 */
export function skewedDistribution(
  mean: number,
  std: number,
  skew: number,
  confidence: number,
  modelId: string,
): ProbabilityDistribution {
  const skewShift = skew * std * 0.3;
  return {
    mean,
    median: mean - skewShift,
    std,
    percentiles: {
      p5: mean - 1.645 * std - skewShift * 0.5,
      p25: mean - 0.674 * std - skewShift * 0.3,
      p75: mean + 0.674 * std + skewShift * 0.3,
      p95: mean + 1.645 * std + skewShift * 0.5,
    },
    confidence,
    modelId,
  };
}

/**
 * Create a point estimate (degenerate distribution with zero std).
 */
export function pointEstimate(
  value: number,
  confidence: number,
  modelId: string,
): ProbabilityDistribution {
  return {
    mean: value,
    median: value,
    std: 0,
    percentiles: { p5: value, p25: value, p75: value, p95: value },
    confidence,
    modelId,
  };
}

/**
 * Combine multiple distributions using weighted average (ensemble).
 * Weights are based on model accuracy (confidence).
 */
export function ensembleDistributions(
  distributions: ProbabilityDistribution[],
): ProbabilityDistribution {
  if (distributions.length === 0) {
    throw new Error("Cannot ensemble zero distributions");
  }
  if (distributions.length === 1) {
    return { ...distributions[0], modelId: "ensemble" };
  }

  // Weight by confidence
  const totalConf = distributions.reduce((s, d) => s + d.confidence, 0);
  const weights = distributions.map((d) =>
    totalConf > 0 ? d.confidence / totalConf : 1 / distributions.length,
  );

  const mean = distributions.reduce((s, d, i) => s + d.mean * weights[i], 0);
  const median = distributions.reduce((s, d, i) => s + d.median * weights[i], 0);

  // Combined std: sqrt of weighted variance + inter-model disagreement
  const weightedVar = distributions.reduce(
    (s, d, i) => s + weights[i] * (d.std * d.std + (d.mean - mean) ** 2),
    0,
  );
  const std = Math.sqrt(weightedVar);

  const p5 = distributions.reduce((s, d, i) => s + d.percentiles.p5 * weights[i], 0);
  const p25 = distributions.reduce((s, d, i) => s + d.percentiles.p25 * weights[i], 0);
  const p75 = distributions.reduce((s, d, i) => s + d.percentiles.p75 * weights[i], 0);
  const p95 = distributions.reduce((s, d, i) => s + d.percentiles.p95 * weights[i], 0);

  // Combined confidence: weighted average, penalized by disagreement
  const disagreement = distributions.reduce(
    (s, d, i) => s + weights[i] * Math.abs(d.mean - mean),
    0,
  );
  const rawConf = distributions.reduce((s, d, i) => s + d.confidence * weights[i], 0);
  const maxMean = Math.max(...distributions.map((d) => Math.abs(d.mean)), 1);
  const confidence = rawConf * Math.max(0.5, 1 - disagreement / maxMean);

  return {
    mean,
    median,
    std,
    percentiles: { p5, p25, p75, p95 },
    confidence,
    modelId: "ensemble",
  };
}
