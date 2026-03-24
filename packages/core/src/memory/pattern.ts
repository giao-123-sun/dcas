// ============================================================
// DCAS L5: Pattern Memory — extract and store patterns
// ============================================================

import type { DecisionRecord, Pattern, PatternCondition } from "./types.js";
import { generateId } from "../utils/id.js";
import type { DCASConfig } from "../config.js";
import { DEFAULT_CONFIG } from "../config.js";

/**
 * In-memory pattern store.
 * Patterns are observations extracted from decision history.
 */
export class PatternMemory {
  private patterns = new Map<string, Pattern>();
  private config: DCASConfig;

  constructor(config?: DCASConfig) {
    this.config = config ?? DEFAULT_CONFIG;
  }

  /**
   * Add or reinforce a pattern.
   * If a similar pattern exists, increment its support count.
   */
  addPattern(params: {
    description: string;
    condition: PatternCondition;
    observation: string;
    confidence: number;
    exampleDecisionId: string;
  }): Pattern {
    // Check for similar existing pattern
    const existing = this.findSimilar(params.condition, params.observation);
    if (existing) {
      existing.supportCount += 1;
      existing.confidence = Math.min(
        this.config.pattern.maxConfidence,
        existing.confidence + (1 - existing.confidence) * this.config.pattern.reinforceRate,
      );
      existing.examples.push(params.exampleDecisionId);
      if (existing.examples.length > this.config.pattern.maxExamples) existing.examples.shift();
      existing.updatedAt = Date.now();
      return existing;
    }

    // Create new pattern
    const pattern: Pattern = {
      id: generateId(),
      description: params.description,
      condition: params.condition,
      observation: params.observation,
      confidence: params.confidence,
      supportCount: 1,
      examples: [params.exampleDecisionId],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.patterns.set(pattern.id, pattern);
    return pattern;
  }

  /**
   * Find patterns that match current conditions.
   */
  query(condition: Partial<PatternCondition>): Pattern[] {
    return [...this.patterns.values()].filter((p) => {
      if (condition.entityTypes && p.condition.entityTypes) {
        const overlap = condition.entityTypes.some((t) =>
          p.condition.entityTypes!.includes(t),
        );
        if (!overlap) return false;
      }
      if (condition.strategyTypes && p.condition.strategyTypes) {
        const overlap = condition.strategyTypes.some((t) =>
          p.condition.strategyTypes!.includes(t),
        );
        if (!overlap) return false;
      }
      return true;
    });
  }

  /**
   * Get all patterns sorted by confidence (descending).
   */
  getAll(): Pattern[] {
    return [...this.patterns.values()].sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get high-confidence patterns (>= threshold).
   */
  getHighConfidence(threshold = 0.7): Pattern[] {
    return this.getAll().filter((p) => p.confidence >= threshold);
  }

  get count(): number {
    return this.patterns.size;
  }

  private findSimilar(condition: PatternCondition, observation: string): Pattern | undefined {
    for (const p of this.patterns.values()) {
      // Simple similarity: same entity types + similar observation
      const sameTypes =
        JSON.stringify([...(p.condition.entityTypes ?? [])].sort()) ===
        JSON.stringify([...(condition.entityTypes ?? [])].sort());
      const similarObs = p.observation === observation;
      if (sameTypes && similarObs) return p;
    }
    return undefined;
  }
}
