import type { Task, ModelAdapter, Evaluator, FrameworkConfig, FrameworkResult } from "../core/types.js";
import { ExperienceStore } from "../core/store.js";

/**
 * Meta-Rule Distillation: extracts META-LEVEL reasoning principles
 * instead of domain-specific rules.
 *
 * Key difference from strict distillation:
 *   Strict: "use contraction mapping for convergence" (domain rule)
 *   Meta:   "when facing a convergence question, check if an applicable
 *            fixed-point theorem exists" (meta rule)
 *
 * The prompt explicitly asks for:
 *   - PROBLEM-SOLVING STRATEGIES, not domain knowledge
 *   - HOW to think, not WHAT to know
 *   - Patterns in reasoning approach, not facts about the answer
 */
export async function metaDistill(
  tasks: Task[],
  model: ModelAdapter,
  evaluator: Evaluator,
  config: FrameworkConfig = { maxRounds: 3 },
  store?: ExperienceStore,
): Promise<FrameworkResult[]> {
  const expStore = store ?? new ExperienceStore();
  const results: FrameworkResult[] = [];

  for (let round = 0; round < config.maxRounds; round++) {
    for (const task of tasks) {
      const start = Date.now();

      const ctx = expStore.count > 0
        ? `Problem-solving strategies learned:\n${expStore.toPromptString()}\n\n`
        : "";
      const content = await model.generate(
        `${ctx}Task: ${task.input}\nGive ONLY the answer, nothing else:`
      );
      const sol = { taskId: task.id, content, round };
      const score = await evaluator.evaluate(task, sol);
      sol.score = score;

      // Meta-level distillation
      if (score >= 0.8) {
        const metaRule = await model.generate(
          `You just solved a problem correctly.

DO NOT describe the specific solution or domain knowledge.
Instead, describe the PROBLEM-SOLVING STRATEGY you used:
- What type of problem is this? (classification, optimization, proof, enumeration, etc.)
- What general approach worked? (reduction, case analysis, invariant, bound estimation, etc.)
- What mental check helped you avoid mistakes?

Express as ONE sentence starting with "When facing a [type] problem..."
Do NOT mention any specific mathematical objects, theorems, or numbers from the problem.`
        );
        expStore.add(metaRule, "success", 0.6);
      } else if (score < 0.5 && task.expectedAnswer) {
        const metaRule = await model.generate(
          `You got a problem wrong.

DO NOT describe the specific error or the correct answer.
Instead, describe the REASONING MISTAKE pattern:
- What type of trap did you fall into? (overcounting, wrong reduction, ignoring edge case, etc.)
- What mental check would have caught this?
- What general problem-solving step did you skip?

Express as ONE sentence starting with "When facing a [type] problem, avoid..."
Do NOT mention any specific mathematical objects, theorems, or numbers.`
        );
        expStore.add(metaRule, "failure", 0.5);
      }

      results.push({
        framework: "meta_distill",
        taskId: task.id,
        bestSolution: sol,
        rounds: round + 1,
        scoreHistory: [score],
        experiences: expStore.getAll(),
        durationMs: Date.now() - start,
      });
    }
  }
  return results;
}
