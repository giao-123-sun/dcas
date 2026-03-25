import type { Task, Solution, ModelAdapter, Evaluator, FrameworkConfig, FrameworkResult } from "../core/types.js";

export async function selfCritique(task: Task, model: ModelAdapter, evaluator: Evaluator, config: FrameworkConfig = { maxRounds: 3 }): Promise<FrameworkResult> {
  const start = Date.now();
  const scoreHistory: number[] = [];
  let content = await model.generate(`Task: ${task.input}\nGive ONLY the answer:`);
  let sol: Solution = { taskId: task.id, content, round: 0 };
  sol.score = await evaluator.evaluate(task, sol);
  scoreHistory.push(sol.score);
  let best = sol, bestScore = sol.score ?? 0;

  for (let round = 1; round < config.maxRounds; round++) {
    const critique = await model.generate(`You answered "${content}" to "${task.input}". Critique: what's wrong?`);
    content = await model.generate(`Task: ${task.input}\nPrevious: "${best.content}"\nCritique: ${critique}\nRevised answer (ONLY the answer):`);
    sol = { taskId: task.id, content, round };
    sol.score = await evaluator.evaluate(task, sol);
    scoreHistory.push(sol.score);
    if ((sol.score ?? 0) > bestScore) { bestScore = sol.score ?? 0; best = sol; }
    if (config.targetScore && (sol.score ?? 0) >= config.targetScore) break;
  }

  return { framework: "self_critique", taskId: task.id, bestSolution: best, rounds: scoreHistory.length, scoreHistory, experiences: [], durationMs: Date.now() - start };
}
