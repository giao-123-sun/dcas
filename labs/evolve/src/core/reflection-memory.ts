import type { Task, Solution } from "./types.js";

export interface Reflection {
  id: string;
  taskId: string;
  taskDescription: string;
  prediction: string;  // what the model answered
  actual: string;      // correct answer
  wasCorrect: boolean;
  reflection: string;  // natural language analysis of what went wrong
  timestamp: number;
}

/**
 * Episodic memory of past attempts with verbal reflections.
 * Retrieved by semantic similarity to current task.
 */
export class ReflectionMemory {
  private reflections: Reflection[] = [];

  add(reflection: Omit<Reflection, "id" | "timestamp">): Reflection {
    const full: Reflection = {
      ...reflection,
      id: `ref_${this.reflections.length}`,
      timestamp: Date.now(),
    };
    this.reflections.push(full);
    return full;
  }

  /** Retrieve reflections most relevant to a task (simple keyword matching for now) */
  retrieve(task: Task, maxResults = 3): Reflection[] {
    const taskWords = new Set(task.input.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    return this.reflections
      .map(r => {
        const refWords = new Set(r.taskDescription.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const overlap = [...taskWords].filter(w => refWords.has(w)).length;
        return { reflection: r, score: overlap };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .filter(r => r.score > 0)
      .map(r => r.reflection);
  }

  /** Format for prompt injection */
  toPromptString(task: Task, maxResults = 3): string {
    const relevant = this.retrieve(task, maxResults);
    if (relevant.length === 0) return "";
    return "Past experiences with similar problems:\n" +
      relevant.map((r, i) =>
        `${i + 1}. Task: "${r.taskDescription.slice(0, 80)}..."\n` +
        `   ${r.wasCorrect ? "✓" : "✗"} Answered: "${r.prediction}" (correct: "${r.actual}")\n` +
        `   Lesson: ${r.reflection}`
      ).join("\n") + "\n";
  }

  get count(): number { return this.reflections.length; }
  getAll(): Reflection[] { return [...this.reflections]; }
}
