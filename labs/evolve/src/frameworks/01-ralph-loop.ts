import type { Task, Solution, ModelAdapter, Evaluator, FrameworkConfig, FrameworkResult } from "../core/types.js";

export async function ralphLoop(task: Task, model: ModelAdapter, evaluator: Evaluator, config: FrameworkConfig = { maxRounds: 5 }): Promise<FrameworkResult> {
  const start = Date.now();
  const scoreHistory: number[] = [];
  let best: Solution | null = null;
  let bestScore = -1;

  for (let round = 0; round < config.maxRounds; round++) {
    const prompt = best
      ? `Previous attempt (score ${bestScore.toFixed(2)}): "${best.content}"\nTask: ${task.input}\nImprove the answer. Give ONLY the answer, nothing else:`
      : `Task: ${task.input}\nGive ONLY the answer, nothing else:`;
    const content = await model.generate(prompt);
    const sol: Solution = { taskId: task.id, content, round };
    sol.score = await evaluator.evaluate(task, sol);
    scoreHistory.push(sol.score);
    if (sol.score > bestScore) { bestScore = sol.score; best = sol; }
    if (config.targetScore && sol.score >= config.targetScore) break;
  }

  return { framework: "ralph_loop", taskId: task.id, bestSolution: best!, rounds: scoreHistory.length, scoreHistory, experiences: [], durationMs: Date.now() - start };
}
