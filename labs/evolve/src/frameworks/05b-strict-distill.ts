import type { Task, ModelAdapter, Evaluator, FrameworkConfig, FrameworkResult } from "../core/types.js";
import { ExperienceStore } from "../core/store.js";

/**
 * Strict Adversarial Distillation — ablation study version.
 *
 * Two key changes vs vanilla:
 * 1. TELLS the distiller upfront that answer-containing rules will be blocked
 *    (changes the model's incentive to produce abstract rules)
 * 2. Hard-filters rules against ALL answer choices and numerical values
 *    (not just string matching the correct answer letter)
 *
 * The distiller prompt explicitly says:
 *   "WARNING: Any rule that contains the specific answer, answer choice text,
 *    or numerical values from the solution will be REJECTED. Only abstract
 *    reasoning principles are accepted."
 */
export async function strictDistill(
  tasks: Task[],
  model: ModelAdapter,
  evaluator: Evaluator,
  config: FrameworkConfig = { maxRounds: 3 },
  store?: ExperienceStore,
): Promise<{ results: FrameworkResult[]; auditLog: AuditEntry[] }> {
  const expStore = store ?? new ExperienceStore();
  const results: FrameworkResult[] = [];
  const auditLog: AuditEntry[] = [];

  for (let round = 0; round < config.maxRounds; round++) {
    for (const task of tasks) {
      const start = Date.now();

      // Clean start with experience bank
      const ctx = expStore.count > 0
        ? `Learned reasoning principles:\n${expStore.toPromptString()}\n\n`
        : "";
      const content = await model.generate(
        `${ctx}Task: ${task.input}\nGive ONLY the answer, nothing else:`
      );
      const sol = { taskId: task.id, content, round };
      const score = await evaluator.evaluate(task, sol);
      sol.score = score;

      // Extract answer choices from the question for filtering
      const answerChoices = extractAnswerChoices(task.input);
      const allForbidden = buildForbiddenSet(task, answerChoices);

      // Distill with WARNING about blocking
      let candidateRule: string | null = null;
      if (score >= 0.8) {
        candidateRule = await model.generate(
          `You correctly solved a task with answer "${content}".

⚠️ WARNING: Your response will be AUTOMATICALLY REJECTED if it contains:
- The specific answer "${content}" or any equivalent
- Any answer choice text (${answerChoices.join(", ")})
- Specific numbers, names, or terms that ARE the answer
- References to "the correct answer is..."

Instead, express a GENERAL reasoning methodology that could apply to SIMILAR problems in the same domain. Focus on the APPROACH, not the specific result.

Task was: "${task.input.slice(0, 200)}..."

One-sentence abstract reasoning principle:`
        );
      } else if (score < 0.5 && task.expectedAnswer) {
        candidateRule = await model.generate(
          `You got a task wrong. Your answer: "${content}", correct: "${task.expectedAnswer}".

⚠️ WARNING: Your response will be AUTOMATICALLY REJECTED if it contains:
- The specific correct answer "${task.expectedAnswer}" or any equivalent
- Any answer choice text (${answerChoices.join(", ")})
- Specific numbers, names, or terms from the problem

Instead, express a GENERAL reasoning principle about what TYPE of mistake you made and how to avoid it in SIMILAR problems.

Task was: "${task.input.slice(0, 200)}..."

One-sentence abstract reasoning principle:`
        );
      }

      // HARD FILTER: reject if rule contains any forbidden content
      if (candidateRule) {
        const { clean, reason } = hardFilter(candidateRule, allForbidden);
        auditLog.push({
          round,
          taskId: task.id,
          rule: candidateRule,
          accepted: clean,
          reason: reason ?? "clean",
        });

        if (clean) {
          expStore.add(candidateRule, score >= 0.8 ? "success" : "failure", 0.6);
        }
        // If rejected, nothing enters the bank — that's the point
      }

      results.push({
        framework: "strict_distill",
        taskId: task.id,
        bestSolution: sol,
        rounds: round + 1,
        scoreHistory: [score],
        experiences: expStore.getAll(),
        durationMs: Date.now() - start,
      });
    }
  }

  return { results, auditLog };
}

export interface AuditEntry {
  round: number;
  taskId: string;
  rule: string;
  accepted: boolean;
  reason: string;
}

/**
 * Extract answer choice texts from a question.
 * e.g., "A. Egalitarian Dominance\nB. General..." → ["Egalitarian Dominance", "General..."]
 */
function extractAnswerChoices(question: string): string[] {
  const choices: string[] = [];
  // Match patterns like "A. Something" or "A) Something"
  const regex = /[A-G][.)]\s*(.+)/g;
  let match;
  while ((match = regex.exec(question)) !== null) {
    choices.push(match[1].trim());
  }
  return choices;
}

/**
 * Build a set of forbidden strings from the task.
 */
function buildForbiddenSet(task: Task, answerChoices: string[]): string[] {
  const forbidden: string[] = [];

  // The expected answer itself
  if (task.expectedAnswer) {
    forbidden.push(task.expectedAnswer.toLowerCase());
  }

  // All answer choice texts (lowercase, trimmed)
  for (const choice of answerChoices) {
    // Add the full choice and significant substrings (>4 chars)
    const lower = choice.toLowerCase().trim();
    if (lower.length > 3) {
      forbidden.push(lower);
    }
    // Also add key phrases within the choice
    const words = lower.split(/\s+/);
    if (words.length >= 2) {
      // Multi-word phrases are more specific
      for (let i = 0; i < words.length - 1; i++) {
        const phrase = words.slice(i, i + 2).join(" ");
        if (phrase.length > 6) forbidden.push(phrase);
      }
    }
  }

  return [...new Set(forbidden)]; // dedupe
}

/**
 * Hard filter: check if rule contains any forbidden content.
 */
function hardFilter(rule: string, forbidden: string[]): { clean: boolean; reason?: string } {
  const lower = rule.toLowerCase();

  for (const f of forbidden) {
    if (f.length < 2) continue; // Skip single characters like "D", "E"
    if (lower.includes(f)) {
      return { clean: false, reason: `Contains forbidden: "${f}"` };
    }
  }

  // Also check for "the answer is", "correct answer", etc.
  const metaPatterns = [
    /the (?:correct |right )?answer (?:is|was|should be)/i,
    /answer(?:ed)? (?:with|as) /i,
    /the result is \d/i,
  ];
  for (const pat of metaPatterns) {
    if (pat.test(rule)) {
      return { clean: false, reason: `Meta-answer reference: ${pat}` };
    }
  }

  return { clean: true };
}
