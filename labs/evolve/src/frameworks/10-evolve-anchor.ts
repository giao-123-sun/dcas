import type { Task, Solution, ModelAdapter, Evaluator, FrameworkConfig, FrameworkResult } from "../core/types.js";
import { ExperienceStore } from "../core/store.js";

/**
 * Evolve-Anchor: Tournament + Experience Distillation + History Anchoring.
 *
 * Combines the best properties:
 * - Tournament's multi-candidate diversity (generate N per round)
 * - Experience Distillation's learning from failure (distill rules)
 * - History pool anchoring (never discard a good answer)
 * - Lock-in: history pool answers can only be REPLACED, not removed
 *
 * Loop:
 *   1. Generate N fresh candidates using experience bank
 *   2. Merge with history pool (anchors)
 *   3. Score all, rank
 *   4. Update history pool (keep top K, never empty)
 *   5. Distill experience from winners vs losers
 *   6. If best improved, celebrate; if not, experience still accumulated
 */
export async function evolveAnchor(
  task: Task,
  model: ModelAdapter,
  evaluator: Evaluator,
  config: FrameworkConfig & { populationSize?: number; historyPoolSize?: number } = { maxRounds: 3 },
): Promise<FrameworkResult> {
  const start = Date.now();
  const store = new ExperienceStore();
  const popSize = config.populationSize ?? 3;
  const poolSize = config.historyPoolSize ?? 2;
  const scoreHistory: number[] = [];
  const historyPool: Solution[] = [];

  let best: Solution | null = null;
  let bestScore = -1;

  for (let round = 0; round < config.maxRounds; round++) {
    const expContext = store.count > 0
      ? `Learned principles:\n${store.toPromptString()}\n\n`
      : "";

    // Generate N fresh candidates (diverse approaches)
    const candidates: Solution[] = [];
    for (let i = 0; i < popSize; i++) {
      const approach = i === 0
        ? "Think step by step."
        : i === 1
        ? "Think about what common mistakes people make, then avoid them."
        : "Consider this from a completely different angle.";

      const content = await model.generate(
        `${expContext}${approach}\nTask: ${task.input}\nGive ONLY the answer, nothing else:`
      );
      candidates.push({ taskId: task.id, content, round });
    }

    // Merge with history pool anchors
    const allCandidates = [...candidates, ...historyPool];

    // Score everyone
    for (const sol of allCandidates) {
      if (sol.score === undefined) {
        sol.score = await evaluator.evaluate(task, sol);
      }
    }

    // Rank
    allCandidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const roundBest = allCandidates[0];
    scoreHistory.push(roundBest.score ?? 0);

    if ((roundBest.score ?? 0) > bestScore) {
      bestScore = roundBest.score ?? 0;
      best = roundBest;
    }

    // Update history pool (anchoring: keep top K, NEVER empty)
    historyPool.length = 0;
    historyPool.push(...allCandidates.slice(0, poolSize));

    // Distill experience: compare winners vs losers
    const mid = Math.ceil(allCandidates.length / 2);
    const winners = allCandidates.slice(0, mid);
    const losers = allCandidates.slice(mid);

    if (losers.length > 0) {
      // Learn from the GAP between best and worst
      const winText = winners.map(w => `"${w.content}" (score:${w.score?.toFixed(2)})`).join(", ");
      const loseText = losers.map(l => `"${l.content}" (score:${l.score?.toFixed(2)})`).join(", ");

      const lesson = await model.generate(
        `Task: "${task.input}"\nBetter answers: ${winText}\nWorse answers: ${loseText}\n\nWhat ONE principle distinguishes correct from incorrect? Be concise:`
      );
      store.add(lesson, "comparison", 0.65);
    }

    // Also learn from failures specifically
    for (const loser of losers) {
      if ((loser.score ?? 0) < 0.3 && task.expectedAnswer) {
        const failLesson = await model.generate(
          `"${loser.content}" is wrong for "${task.input}" (correct: ${task.expectedAnswer}). What reasoning error led to this? ONE rule to prevent it:`
        );
        store.add(failLesson, "failure", 0.5);
      }
    }

    if (config.targetScore && bestScore >= config.targetScore) break;
  }

  return {
    framework: "evolve_anchor",
    taskId: task.id,
    bestSolution: best!,
    rounds: scoreHistory.length,
    scoreHistory,
    experiences: store.getAll(),
    durationMs: Date.now() - start,
  };
}
