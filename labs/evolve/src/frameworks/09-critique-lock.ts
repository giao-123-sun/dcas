import type { Task, Solution, ModelAdapter, Evaluator, FrameworkConfig, FrameworkResult } from "../core/types.js";
import { ExperienceStore } from "../core/store.js";

/**
 * Critique-Lock: Self-Critique with answer lock-in.
 *
 * Fixes the "find-then-lose" problem of vanilla Self-Critique.
 * Once a high-scoring answer is found, it is LOCKED — critique generates
 * experience rules instead of direct revisions. New attempts must BEAT
 * the locked answer, not modify it.
 *
 * Loop:
 *   1. Generate answer
 *   2. If score > locked_score → LOCK this answer
 *   3. Critique the answer → extract experience rule (not revision)
 *   4. Generate NEW attempt using experience (fresh, not revision of locked)
 *   5. If new attempt > locked → replace lock
 *   6. Repeat
 */
export async function critiqueLock(
  task: Task,
  model: ModelAdapter,
  evaluator: Evaluator,
  config: FrameworkConfig = { maxRounds: 4 },
  lockThreshold = 0.5,
): Promise<FrameworkResult> {
  const start = Date.now();
  const store = new ExperienceStore();
  const scoreHistory: number[] = [];

  // Initial attempt
  let content = await model.generate(`Task: ${task.input}\nGive ONLY the answer, nothing else:`);
  let sol: Solution = { taskId: task.id, content, round: 0 };
  sol.score = await evaluator.evaluate(task, sol);
  scoreHistory.push(sol.score);

  let locked: Solution = sol;
  let lockedScore = sol.score ?? 0;

  for (let round = 1; round < config.maxRounds; round++) {
    // Critique the LOCKED answer → extract experience, NOT revision
    const critique = await model.generate(
      `Task: "${task.input}"\nAnswer: "${locked.content}"\n\nAnalyze this answer. What reasoning principle should be applied? Give ONE concise rule, not a revised answer:`
    );
    store.add(critique, lockedScore >= lockThreshold ? "success" : "failure", 0.6);

    // Generate FRESH attempt with accumulated experience (not revision of locked)
    const expContext = store.toPromptString();
    const newContent = await model.generate(
      `Reasoning principles learned:\n${expContext}\n\nTask: ${task.input}\nApply the principles above. Give ONLY the answer, nothing else:`
    );

    const newSol: Solution = { taskId: task.id, content: newContent, round };
    newSol.score = await evaluator.evaluate(task, newSol);
    scoreHistory.push(newSol.score);

    // Only replace locked if strictly better
    if ((newSol.score ?? 0) > lockedScore) {
      locked = newSol;
      lockedScore = newSol.score ?? 0;
    }
    // If new attempt is worse, the experience from critique still accumulates

    if (config.targetScore && lockedScore >= config.targetScore) break;
  }

  return {
    framework: "critique_lock",
    taskId: task.id,
    bestSolution: locked,
    rounds: scoreHistory.length,
    scoreHistory,
    experiences: store.getAll(),
    durationMs: Date.now() - start,
  };
}
