import type { Task, Solution, Evaluator } from "./types.js";

export class ExactMatchEvaluator implements Evaluator {
  async evaluate(task: Task, solution: Solution): Promise<number> {
    if (!task.expectedAnswer) return 0.5;
    const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    return clean(solution.content) === clean(task.expectedAnswer) ? 1.0 : 0.0;
  }
}

export class ContainsEvaluator implements Evaluator {
  async evaluate(task: Task, solution: Solution): Promise<number> {
    if (!task.expectedAnswer) return 0.5;
    const answer = task.expectedAnswer.trim().toLowerCase();
    const content = solution.content.trim().toLowerCase();
    if (content === answer) return 1.0;
    const na = parseFloat(answer), nc = parseFloat(content);
    if (!isNaN(na) && !isNaN(nc)) {
      const diff = Math.abs(na - nc) / Math.max(Math.abs(na), 1);
      if (diff < 0.01) return 0.95;
      if (diff < 0.1) return 0.7;
    }
    if (content.includes(answer)) return 0.8;
    return 0.0;
  }
}
