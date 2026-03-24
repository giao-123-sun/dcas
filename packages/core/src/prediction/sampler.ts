import type { ProbabilityDistribution } from "./types.js";

/**
 * Seeded pseudo-random number generator (xorshift128+).
 * Produces deterministic sequences from a given seed.
 */
export function createSeededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296);
  };
}

/**
 * Sample from normal distribution using Box-Muller transform.
 */
export function sampleNormal(mean: number, std: number, rng?: () => number): number {
  const random = rng ?? Math.random;
  if (std === 0) return mean;
  const u1 = random();
  const u2 = random();
  const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

/**
 * Sample from an empirical distribution (random element from array).
 */
export function sampleEmpirical(samples: number[], rng?: () => number): number {
  const random = rng ?? Math.random;
  if (samples.length === 0) throw new Error("Cannot sample from empty array");
  return samples[Math.floor(random() * samples.length)];
}

/**
 * Sample from a ProbabilityDistribution.
 * Uses normal approximation based on mean and std.
 */
export function sampleFromDistribution(dist: ProbabilityDistribution, rng?: () => number): number {
  if (dist.std === 0) return dist.mean;
  return sampleNormal(dist.mean, dist.std, rng);
}

/**
 * Compute coefficient of variation (std/mean) for convergence detection.
 */
export function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return Infinity;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (Math.abs(mean) < 1e-10) return Infinity;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / Math.abs(mean);
}

/**
 * Build a ProbabilityDistribution from empirical samples.
 */
export function empiricalDistribution(values: number[], modelId = "simulation"): ProbabilityDistribution {
  if (values.length === 0) {
    return { mean: 0, median: 0, std: 0, percentiles: { p5: 0, p25: 0, p75: 0, p95: 0 }, confidence: 0, modelId };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(n - 1, 1);
  const std = Math.sqrt(variance);

  const percentile = (p: number) => {
    const idx = Math.max(0, Math.min(n - 1, Math.floor(p / 100 * n)));
    return sorted[idx];
  };

  return {
    mean,
    median: sorted[Math.floor(n / 2)],
    std,
    percentiles: {
      p5: percentile(5),
      p25: percentile(25),
      p75: percentile(75),
      p95: percentile(95),
    },
    confidence: Math.min(0.95, 1 - coefficientOfVariation(values)),
    modelId,
  };
}
