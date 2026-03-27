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
      } else if (task.expectedAnswer) {
        reflection = await model.generate(
          `You got "${task.input}" wrong. Answered "${content}", correct: "${task.expectedAnswer}".
What went wrong? What should you CHECK next time for similar problems?
One sentence, do NOT include the specific answer:`
        );
        expStore.add(reflection, "failure", 0.5);
      } else {
        reflection = "No reflection generated.";
      }

      // Store reflection in episodic memory
      refMem.add({
        taskId: task.id,
        taskDescription: task.input,
        prediction: content,
        actual: task.expectedAnswer ?? "unknown",
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
