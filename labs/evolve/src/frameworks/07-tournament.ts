import type { Task, Solution, ModelAdapter, Evaluator, FrameworkConfig, FrameworkResult } from "../core/types.js";
import { ExperienceStore } from "../core/store.js";

export async function tournamentEvolution(task: Task, model: ModelAdapter, evaluator: Evaluator, config: FrameworkConfig & { populationSize?: number; historyPoolSize?: number } = { maxRounds: 3 }): Promise<FrameworkResult> {
  const start = Date.now();
  const store = new ExperienceStore();
  const popSize = config.populationSize ?? 4;
  const poolSize = config.historyPoolSize ?? 3;
  const scoreHistory: number[] = [];
  const historyPool: Solution[] = [];
  let best: Solution | null = null, bestScore = -1;

  for (let round = 0; round < config.maxRounds; round++) {
    const ctx = store.count > 0 ? `Experiences:\n${store.toPromptString()}\n\n` : "";
    const candidates: Solution[] = [];
    for (let i = 0; i < popSize; i++) {
      const variation = i > 0 ? ` (Try approach #${i + 1})` : "";
      const content = await model.generate(`${ctx}Task: ${task.input}${variation}\nGive ONLY the answer:`);
      candidates.push({ taskId: task.id, content, round });
    }
    const all = [...candidates, ...historyPool.slice(0, poolSize)];
    for (const s of all) { s.score = await evaluator.evaluate(task, s); }
    all.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    scoreHistory.push(all[0].score ?? 0);
    if ((all[0].score ?? 0) > bestScore) { bestScore = all[0].score ?? 0; best = all[0]; }

    historyPool.length = 0;
    historyPool.push(...all.slice(0, poolSize));

    const mid = Math.ceil(all.length / 2);
    const winners = all.slice(0, mid).map(s => `"${s.content}"`).join(", ");
    const losers = all.slice(mid).map(s => `"${s.content}"`).join(", ");
    const lesson = await model.generate(`Best: ${winners}. Worst: ${losers}. Task: "${task.input}". What pattern distinguishes good from bad? One rule:`);
    store.add(lesson, "comparison", 0.6);

    if (config.targetScore && bestScore >= config.targetScore) break;
  }

  return { framework: "tournament_evolution", taskId: task.id, bestSolution: best!, rounds: scoreHistory.length, scoreHistory, experiences: store.getAll(), durationMs: Date.now() - start };
}
