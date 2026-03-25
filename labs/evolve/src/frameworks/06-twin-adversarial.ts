import type { Task, Solution, ModelAdapter, Evaluator, FrameworkConfig, FrameworkResult } from "../core/types.js";
import { ExperienceStore } from "../core/store.js";

export async function twinAdversarial(task: Task, model: ModelAdapter, evaluator: Evaluator, config: FrameworkConfig = { maxRounds: 3 }): Promise<FrameworkResult> {
  const start = Date.now();
  const store = new ExperienceStore();
  const scoreHistory: number[] = [];
  let best: Solution | null = null, bestScore = -1;

  for (let round = 0; round < config.maxRounds; round++) {
    const ctx = store.count > 0 ? `Shared experiences:\n${store.toPromptString()}\n\n` : "";
    const cA = await model.generate(`${ctx}You are Agent A. Task: ${task.input}\nGive ONLY the answer:`);
    const cB = await model.generate(`${ctx}You are Agent B, try a different approach. Task: ${task.input}\nGive ONLY the answer:`);
    const solA: Solution = { taskId: task.id, content: cA, round, meta: { agent: "A" } };
    const solB: Solution = { taskId: task.id, content: cB, round, meta: { agent: "B" } };
    const sA = await evaluator.evaluate(task, solA); solA.score = sA;
    const sB = await evaluator.evaluate(task, solB); solB.score = sB;
    const winner = sA >= sB ? solA : solB;
    const loser = sA >= sB ? solB : solA;
    scoreHistory.push(Math.max(sA, sB));
    if (Math.max(sA, sB) > bestScore) { bestScore = Math.max(sA, sB); best = winner; }

    const wLesson = await model.generate(`"${winner.content}" beat "${loser.content}" for "${task.input}". What made it better? One rule:`);
    store.add(wLesson, "success", 0.7);
    const lLesson = await model.generate(`"${loser.content}" lost to "${winner.content}" for "${task.input}". What went wrong? One rule:`);
    store.add(lLesson, "failure", 0.5);

    if (config.targetScore && bestScore >= config.targetScore) break;
  }

  return { framework: "twin_adversarial", taskId: task.id, bestSolution: best!, rounds: scoreHistory.length, scoreHistory, experiences: store.getAll(), durationMs: Date.now() - start };
}
