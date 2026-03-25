import type { Task, ModelAdapter, Evaluator, FrameworkConfig, FrameworkResult } from "../core/types.js";
import { ExperienceStore } from "../core/store.js";

export async function experienceDistill(tasks: Task[], model: ModelAdapter, evaluator: Evaluator, config: FrameworkConfig = { maxRounds: 3 }, store?: ExperienceStore): Promise<FrameworkResult[]> {
  const expStore = store ?? new ExperienceStore();
  const results: FrameworkResult[] = [];

  for (let round = 0; round < config.maxRounds; round++) {
    for (const task of tasks) {
      const start = Date.now();
      const ctx = expStore.count > 0 ? `Learned rules:\n${expStore.toPromptString()}\n\n` : "";
      const content = await model.generate(`${ctx}Task: ${task.input}\nGive ONLY the answer:`);
      const sol = { taskId: task.id, content, round };
      const score = await evaluator.evaluate(task, sol);
      sol.score = score;

      if (score >= 0.8) {
        const lesson = await model.generate(`You solved "${task.input}" correctly with "${content}". What general rule helped? One sentence:`);
        expStore.add(lesson, "success", 0.7);
      } else if (score < 0.5 && task.expectedAnswer) {
        const lesson = await model.generate(`You got "${task.input}" wrong. Your answer: "${content}", correct: "${task.expectedAnswer}". What rule would prevent this? One sentence:`);
        expStore.add(lesson, "failure", 0.5);
      }

      results.push({ framework: "experience_distill", taskId: task.id, bestSolution: sol, rounds: round + 1, scoreHistory: [score], experiences: expStore.getAll(), durationMs: Date.now() - start });
    }
  }
  return results;
}
