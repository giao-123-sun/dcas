import type { Experience } from "./types.js";

export class ExperienceStore {
  private experiences: Experience[] = [];

  add(rule: string, source: Experience["source"], confidence = 0.5): Experience {
    const existing = this.experiences.find(e => e.rule === rule);
    if (existing) {
      existing.supportCount++;
      existing.confidence = Math.min(0.99, existing.confidence + (1 - existing.confidence) * 0.1);
      return existing;
    }
    const exp: Experience = { id: `exp_${this.experiences.length}`, rule, supportCount: 1, confidence, source };
    this.experiences.push(exp);
    return exp;
  }

  getAll(): Experience[] { return [...this.experiences].sort((a, b) => b.confidence - a.confidence); }
  getTop(n: number): Experience[] { return this.getAll().slice(0, n); }

  toPromptString(maxItems = 10): string {
    const items = this.getTop(maxItems);
    if (items.length === 0) return "No experiences yet.";
    return items.map((e, i) => `${i + 1}. [${e.source}] ${e.rule} (confidence: ${e.confidence.toFixed(2)})`).join("\n");
  }

  get count(): number { return this.experiences.length; }
  clear(): void { this.experiences = []; }
}
