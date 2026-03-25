/**
 * Audit: check if experience distillation leaks direct answers.
 * Run: OPENROUTER_API_KEY=xxx npx tsx src/audit-experiences.ts
 */
import { LLMModel, CostTracker } from "./core/llm-model.js";
import { ContainsEvaluator } from "./core/evaluator.js";
import { hleRound2Tasks, hleTasks } from "./benchmarks/tasks.js";
import { experienceDistill } from "./frameworks/04-experience-distill.js";
import { ExperienceStore } from "./core/store.js";
import type { Task } from "./core/types.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("Set OPENROUTER_API_KEY"); process.exit(1); }

const proxy = process.env.LLM_PROXY || "http://127.0.0.1:7890";
const tracker = new CostTracker();
const model = new LLMModel(apiKey, "google/gemini-3-flash-preview", undefined, proxy, tracker);
const evaluator = new ContainsEvaluator();

// Pick tasks where distillation succeeded (to check if it cheated)
const auditTasks: Task[] = [
  hleTasks[0],         // philosophy (Arrhenius) — distill went 0→1
  hleTasks[3],         // physics (KK eigenvalues) — distill went 0→1
  hleRound2Tasks[2],   // fock space — distill went 0→0→1
];

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   EXPERIENCE AUDIT: Is the model leaking answers?       ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  for (const task of auditTasks) {
    console.log(`━━━ Task: ${task.id} ━━━`);
    console.log(`Q: ${task.input.slice(0, 100)}...`);
    console.log(`Expected Answer: "${task.expectedAnswer}"\n`);

    const store = new ExperienceStore();
    const results = await experienceDistill([task], model, evaluator, { maxRounds: 3 }, store);

    // Print ALL experiences generated
    const exps = store.getAll();
    console.log(`Experiences generated: ${exps.length}\n`);

    for (const exp of exps) {
      const answer = task.expectedAnswer?.toLowerCase() ?? "";
      const rule = exp.rule.toLowerCase();

      // Check for answer leakage
      const containsExactAnswer = rule.includes(answer);
      const containsAnswerVariant = answer.length > 1 && (
        rule.includes(`answer is ${answer}`) ||
        rule.includes(`correct answer`) ||
        rule.includes(`the answer`) ||
        rule.includes(`= ${answer}`) ||
        rule.includes(`result is ${answer}`)
      );

      const leakFlag = containsExactAnswer ? " ⚠️  CONTAINS ANSWER!" :
                       containsAnswerVariant ? " ⚠️  REFERENCES ANSWER!" : "";
      const icon = exp.source === "success" ? "✓" : "✗";

      console.log(`  [${icon} ${exp.source.padEnd(7)}] "${exp.rule}"${leakFlag}`);
    }

    // Print score trajectory
    const scores = results.map(r => r.bestSolution.score ?? 0);
    console.log(`\n  Score trajectory: ${scores.map(s => s.toFixed(2)).join(" → ")}`);

    // Verdict
    const leaked = exps.some(e => {
      const r = e.rule.toLowerCase();
      const a = (task.expectedAnswer ?? "").toLowerCase();
      return r.includes(a) && a.length > 0;
    });

    if (leaked) {
      console.log(`  🔴 VERDICT: ANSWER LEAKED into experience bank!`);
      console.log(`     The improvement may be due to memorization, not learning.`);
    } else {
      console.log(`  🟢 VERDICT: No direct answer leakage detected.`);
    }
    console.log("");
  }

  console.log(`\n${tracker.summary()}`);
}

main().catch(console.error);
