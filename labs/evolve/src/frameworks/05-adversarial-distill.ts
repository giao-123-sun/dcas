import type { Task, ModelAdapter, Evaluator, FrameworkConfig, FrameworkResult } from "../core/types.js";
import { ExperienceStore } from "../core/store.js";

/**
 * Adversarial Experience Distillation: adds a "reviewer" that audits
 * every experience rule BEFORE it enters the experience bank.
 *
 * Fixes the answer-leakage problem found in vanilla Experience Distillation:
 *   e.g. "Critical-level views violate Weak Non-Sadism" ← LEAKS answer D
 *
 * The reviewer checks if a rule contains:
 *   - Specific answers, numbers, or proper nouns from the problem
 *   - Direct references to the correct answer
 *   - Task-specific data points rather than general principles
 *
 * If the rule is contaminated, the reviewer either:
 *   - REWRITES it as a general principle (removing specifics)
 *   - REJECTS it entirely
 *
 * Loop:
 *   1. Clean instance solves task (with experience bank)
 *   2. Distill candidate rule from success/failure
 *   3. REVIEWER audits the rule ← NEW
 *   4. If clean → add to bank. If contaminated → rewrite or reject.
 *   5. Reset and repeat
 */
export async function adversarialDistill(
  tasks: Task[],
  model: ModelAdapter,
  evaluator: Evaluator,
  config: FrameworkConfig = { maxRounds: 3 },
  store?: ExperienceStore,
): Promise<FrameworkResult[]> {
  const expStore = store ?? new ExperienceStore();
  const results: FrameworkResult[] = [];
  let rejectedCount = 0;
  let rewrittenCount = 0;

  for (let round = 0; round < config.maxRounds; round++) {
    for (const task of tasks) {
      const start = Date.now();

      // Clean start — only experience bank
      const ctx = expStore.count > 0
        ? `Learned reasoning principles:\n${expStore.toPromptString()}\n\n`
        : "";
      const content = await model.generate(
        `${ctx}Task: ${task.input}\nGive ONLY the answer, nothing else:`
      );
      const sol = { taskId: task.id, content, round };
      const score = await evaluator.evaluate(task, sol);
      sol.score = score;

      // Distill candidate rule
      let candidateRule: string;
      if (score >= 0.8) {
        candidateRule = await model.generate(
          `You correctly solved: "${task.input}" with answer "${content}".\nWhat GENERAL reasoning principle helped? Express as a reusable rule. DO NOT include the specific answer, any proper nouns from the question, or any task-specific data. One sentence:`
        );
      } else if (score < 0.5 && task.expectedAnswer) {
        candidateRule = await model.generate(
          `You got "${task.input}" wrong. Your answer: "${content}", correct: "${task.expectedAnswer}".\nWhat GENERAL reasoning rule would prevent this mistake? DO NOT include the specific answer or any task-specific details. One sentence:`
        );
      } else {
        // Skip distillation for middling scores
        results.push({
          framework: "adversarial_distill",
          taskId: task.id,
          bestSolution: sol,
          rounds: round + 1,
          scoreHistory: [score],
          experiences: expStore.getAll(),
          durationMs: Date.now() - start,
        });
        continue;
      }

      // === REVIEWER: Audit the candidate rule ===
      const auditResult = await model.generate(
        `You are a STRICT auditor. Your job is to check if a "reasoning rule" is actually leaking specific answers.

The rule was distilled from this task: "${task.input.slice(0, 150)}..."
The correct answer is: "${task.expectedAnswer}"

The candidate rule is: "${candidateRule}"

Check if this rule:
1. Contains the specific answer or its equivalent (e.g., the letter, number, name, or concept that IS the answer)
2. Contains proper nouns, specific numbers, or data points from the problem that could trivially reveal the answer
3. Is actually a GENERAL reasoning principle that could help with OTHER similar problems

Respond with EXACTLY one of:
- "CLEAN" if the rule is a genuine general principle
- "CONTAMINATED: <reason>" if it leaks the answer
- "REWRITE: <cleaner version>" if you can salvage the principle by removing specifics`
      );

      const auditLower = auditResult.trim();

      if (auditLower.startsWith("CLEAN")) {
        expStore.add(candidateRule, score >= 0.8 ? "success" : "failure", 0.6);
      } else if (auditLower.startsWith("REWRITE:")) {
        const cleaned = auditResult.slice(auditResult.indexOf(":") + 1).trim();
        expStore.add(cleaned, score >= 0.8 ? "success" : "failure", 0.5);
        rewrittenCount++;
      } else {
        // CONTAMINATED — reject
        rejectedCount++;
      }

      results.push({
        framework: "adversarial_distill",
        taskId: task.id,
        bestSolution: sol,
        rounds: round + 1,
        scoreHistory: [score],
        experiences: expStore.getAll(),
        durationMs: Date.now() - start,
      });
    }
  }

  // Log audit stats
  if (config.verbose) {
    console.log(`  [Adversarial Audit] Rejected: ${rejectedCount}, Rewritten: ${rewrittenCount}, Clean: ${expStore.count}`);
  }

  return results;
}
