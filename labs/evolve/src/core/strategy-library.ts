import type { FrameworkResult } from "./types.js";

export interface StrategyEntry {
  id: string;
  taskDescription: string;
  framework: string;
  strategy: string;        // the approach that worked
  score: number;
  uses: number;
  lastUsed: number;
}

/**
 * Library of proven strategies indexed by task similarity.
 * New tasks retrieve relevant past successes to bootstrap.
 */
export class StrategyLibrary {
  private entries: StrategyEntry[] = [];

  /** Store a successful strategy */
  store(taskDesc: string, framework: string, strategy: string, score: number): StrategyEntry {
    // Check for duplicate
    const existing = this.entries.find(e => e.strategy === strategy);
    if (existing) {
      existing.uses++;
      existing.score = Math.max(existing.score, score);
      existing.lastUsed = Date.now();
      return existing;
    }

    const entry: StrategyEntry = {
      id: `strat_${this.entries.length}`,
      taskDescription: taskDesc,
      framework,
      strategy,
      score,
      uses: 1,
      lastUsed: Date.now(),
    };
    this.entries.push(entry);
    return entry;
  }

  /** Retrieve strategies relevant to a task */
  retrieve(taskDesc: string, maxResults = 3): StrategyEntry[] {
    const words = new Set(taskDesc.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    return this.entries
      .map(e => {
        const eWords = new Set(e.taskDescription.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const overlap = [...words].filter(w => eWords.has(w)).length;
        return { entry: e, relevance: overlap + e.score * 0.5 };
      })
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxResults)
      .filter(r => r.relevance > 0)
      .map(r => r.entry);
  }

  /** Format for prompt injection */
  toPromptString(taskDesc: string, maxResults = 3): string {
    const relevant = this.retrieve(taskDesc, maxResults);
    if (relevant.length === 0) return "";
    return "Proven strategies for similar problems:\n" +
      relevant.map((e, i) =>
        `${i + 1}. [score=${e.score.toFixed(2)}] ${e.strategy.slice(0, 100)}`
      ).join("\n") + "\n";
  }

  get count(): number { return this.entries.length; }
  getTop(n: number): StrategyEntry[] {
    return [...this.entries].sort((a, b) => b.score - a.score).slice(0, n);
  }
}
