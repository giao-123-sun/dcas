import type { Task, Solution, ModelAdapter, Evaluator, FrameworkConfig, FrameworkResult } from "../core/types.js";
import { ReflectionMemory } from "../core/reflection-memory.js";
import { StrategyLibrary } from "../core/strategy-library.js";
import { ExperienceStore } from "../core/store.js";

/**
 * Reflexion-Ratchet: combines three agent patterns:
 *
 * 1. Reflexion Memory: before solving, retrieve reflections from past similar tasks
 * 2. Strategy Library: retrieve proven strategies for similar problems
 * 3. Git Ratchet: only keep improvements, never regress
 *
 * This is the "compound learner" — each attempt benefits from ALL past attempts.
 */
export async function reflexionRatchet(
  tasks: Task[],
  model: ModelAdapter,
  evaluator: Evaluator,
  config: FrameworkConfig = { maxRounds: 3 },
  reflectionMem?: ReflectionMemory,
  strategyLib?: StrategyLibrary,
  experienceStore?: ExperienceStore,
): Promise<FrameworkResult[]> {
  const refMem = reflectionMem ?? new ReflectionMemory();
  const stratLib = strategyLib ?? new StrategyLibrary();
  const expStore = experienceStore ?? new ExperienceStore();
  const results: FrameworkResult[] = [];

  for (let round = 0; round < config.maxRounds; round++) {
    for (const task of tasks) {
      const start = Date.now();

      // === RETRIEVE: past reflections + proven strategies + experience rules ===
      const reflections = refMem.toPromptString(task);
      const strategies = stratLib.toPromptString(task.input);
      const experience = expStore.count > 0 ? `Learned rules:\n${expStore.toPromptString()}\n` : "";

      const context = [reflections, strategies, experience].filter(s => s.length > 0).join("\n");

      // === SOLVE ===
      const content = await model.generate(
        `${context ? context + "\n" : ""}Task: ${task.input}\nGive ONLY the answer, nothing else:`
      );
      const sol: Solution = { taskId: task.id, content, round };
      const score = await evaluator.evaluate(task, sol);
      sol.score = score;

      // === GIT RATCHET: only record if this is our best for this task ===
      const prevBest = results
        .filter(r => r.taskId === task.id)
        .reduce((best, r) => Math.max(best, r.bestSolution.score ?? 0), 0);

      const isImprovement = score > prevBest;

      // === REFLECT: generate verbal reflection regardless of outcome ===
      let reflection: string;
      if (score >= 0.8) {
        reflection = await model.generate(
          `You correctly solved: "${task.input}" with "${content}".
What reasoning approach worked? What should you REMEMBER for similar problems?
One sentence, focus on the METHOD not the specific answer:`
        );
        // Store in strategy library (only improvements)
        if (isImprovement) {
          stratLib.store(task.input, "reflexion_ratchet", reflection, score);
        }
        expStore.add(reflection, "success", 0.7);
      } else {
        // IMPORTANT: Do NOT reveal the correct answer in the reflection prompt.
        // Telling the model "correct: X" would leak the answer into memory,
        // making subsequent rounds trivial (open-book test, not learning).
        reflection = await model.generate(
          `You attempted "${task.input}" and your answer "${content}" was INCORRECT.
You do NOT know the correct answer. Based only on the problem structure and your reasoning process:
What TYPE of mistake might you have made? What should you CHECK next time?
One sentence, focus on reasoning methodology, not the specific answer:`
        );
        expStore.add(reflection, "failure", 0.5);
      }

      // Store reflection in episodic memory
      // NOTE: we store "unknown" as actual to prevent answer leakage through memory retrieval
      refMem.add({
        taskId: task.id,
        taskDescription: task.input,
        prediction: content,
        actual: score >= 0.8 ? content : "unknown",  // only store answer if model got it RIGHT
        wasCorrect: score >= 0.8,
        reflection,
      });

      results.push({
        framework: "reflexion_ratchet",
        taskId: task.id,
        bestSolution: isImprovement ? sol : (results.find(r => r.taskId === task.id && (r.bestSolution.score ?? 0) === prevBest)?.bestSolution ?? sol),
        rounds: round + 1,
        scoreHistory: [score],
        experiences: expStore.getAll(),
        durationMs: Date.now() - start,
      });
    }
  }

  return results;
}
