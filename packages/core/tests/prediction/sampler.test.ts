import { describe, it, expect } from "vitest";
import {
  createSeededRng,
  sampleNormal,
  sampleEmpirical,
  sampleFromDistribution,
  coefficientOfVariation,
  empiricalDistribution,
} from "../../src/prediction/sampler.js";
import { pointEstimate } from "../../src/prediction/distribution.js";

describe("Sampler", () => {
  it("seeded RNG should be reproducible", () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);
    const values1 = Array.from({ length: 100 }, () => rng1());
    const values2 = Array.from({ length: 100 }, () => rng2());
    expect(values1).toEqual(values2);
  });

  it("sampleNormal should produce correct statistics", () => {
    const rng = createSeededRng(42);
    const samples = Array.from({ length: 10000 }, () => sampleNormal(50000, 10000, rng));
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const std = Math.sqrt(samples.reduce((s, v) => s + (v - mean) ** 2, 0) / (samples.length - 1));
    expect(mean).toBeGreaterThan(49000);
    expect(mean).toBeLessThan(51000);
    expect(std).toBeGreaterThan(9000);
    expect(std).toBeLessThan(11000);
  });

  it("sampleNormal with std=0 should return mean", () => {
    expect(sampleNormal(42, 0)).toBe(42);
    expect(sampleNormal(42, 0)).toBe(42);
  });

  it("sampleFromDistribution with std=0 should return mean", () => {
    const dist = pointEstimate(42, 1.0, "test");
    for (let i = 0; i < 10; i++) {
      expect(sampleFromDistribution(dist)).toBe(42);
    }
  });

  it("sampleEmpirical should return values from array", () => {
    const rng = createSeededRng(99);
    const samples = [10, 20, 30];
    for (let i = 0; i < 50; i++) {
      expect(samples).toContain(sampleEmpirical(samples, rng));
    }
  });

  it("sampleEmpirical should throw on empty array", () => {
    expect(() => sampleEmpirical([])).toThrow();
  });

  it("coefficientOfVariation should be 0 for constant values", () => {
    expect(coefficientOfVariation([5, 5, 5, 5])).toBeCloseTo(0, 5);
  });

  it("empiricalDistribution should compute correct stats", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const dist = empiricalDistribution(values);
    expect(dist.mean).toBe(55);
    expect(dist.percentiles.p5).toBeLessThanOrEqual(20);
    expect(dist.percentiles.p95).toBeGreaterThanOrEqual(90);
    expect(dist.std).toBeGreaterThan(0);
  });
});
