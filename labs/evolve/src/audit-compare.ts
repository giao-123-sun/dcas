/**
 * Compare vanilla vs adversarial experience distillation.
 * Shows whether the auditor catches answer leakage and whether
 * performance holds up with clean experiences.
 *
 * Run: OPENROUTER_API_KEY=xxx npx tsx src/audit-compare.ts
 */
import { LLMModel, CostTracker } from "./core/llm-model.js";
import { ContainsEvaluator } from "./core/evaluator.js";
import { hleTasks, hleRound2Tasks } from "./benchmarks/tasks.js";
import { experienceDistill } from "./frameworks/04-experience-distill.js";
import { adversarialDistill } from "./frameworks/05-adversarial-distill.js";
import { ExperienceStore } from "./core/store.js";
import type { Task } from "./core/types.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("Set OPENROUTER_API_KEY"); process.exit(1); }

const proxy = process.env.LLM_PROXY || "http://127.0.0.1:7890";
const tracker = new CostTracker();
const model = new LLMModel(apiKey, "google/gemini-3-flash-preview", undefined, proxy, tracker);
const evaluator = new ContainsEvaluator();

// Tasks where distillation was suspected of cheating
const tasks: Task[] = [
  hleTasks[0],         // philosophy (known leaker)
  hleTasks[3],         // physics (known clean learner)
  hleRound2Tasks[0],   // knot theory
];

async function runAndReport(name: string, task: Task, results: any[], store: ExperienceStore) {
  const scores = results.filter(r => r.taskId === task.id).map(r => r.bestSolution.score ?? 0);
  const exps = store.getAll();

  console.log(`  ┌─ ${name} ──────────────────────────────────`);
  console.log(`  │ Scores: ${scores.map(s => s >= 0.8 ? "██" : "░░").join(" → ")} (${scores.map(s => s.toFixed(2)).join("→")})`);
  console.log(`  │ Experiences (${exps.length}):`);
  for (const e of exps) {
    const answer = (task.expectedAnswer ?? "").toLowerCase();
    const leaked = answer.length > 0 && e.rule.toLowerCase().includes(answer);
    const flag = leaked ? " ⚠️ LEAK" : "";
    console.log(`  │   [${e.source}] "${e.rule.slice(0, 90)}..."${flag}`);
  }
  console.log(`  └──────────────────────────────────────────────\n`);

  return { scores, leaked: exps.some(e => e.rule.toLowerCase().includes((task.expectedAnswer ?? "").toLowerCase()) && (task.expectedAnswer ?? "").length > 0) };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Vanilla vs Adversarial Experience Distillation             ║");
  console.log("║  Does the auditor catch leakage? Does performance hold?     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  for (const task of tasks) {
    console.log(`━━━ ${task.id}: "${task.input.slice(0, 80)}..." (expected: ${task.expectedAnswer}) ━━━\n`);

    // Run vanilla
    const vanillaStore = new ExperienceStore();
    const vanillaStartCost = tracker.totalCost;
    const vanillaResults = await experienceDistill([task], model, evaluator, { maxRounds: 3 }, vanillaStore);
    const vanillaCost = tracker.totalCost - vanillaStartCost;
    const vanilla = await runAndReport("Vanilla Distill", task, vanillaResults, vanillaStore);

    // Run adversarial
    const advStore = new ExperienceStore();
    const advStartCost = tracker.totalCost;
    const advResults = await adversarialDistill([task], model, evaluator, { maxRounds: 3, verbose: true }, advStore);
    const advCost = tracker.totalCost - advStartCost;
    const adv = await runAndReport("Adversarial Distill", task, advResults, advStore);

    // Comparison
    const vanillaBest = Math.max(...vanilla.scores);
    const advBest = Math.max(...adv.scores);
    console.log(`  Vanilla:     best=${vanillaBest.toFixed(2)} | leaked=${vanilla.leaked ? "🔴 YES" : "🟢 NO"} | cost=$${vanillaCost.toFixed(4)}`);
    console.log(`  Adversarial: best=${advBest.toFixed(2)} | leaked=${adv.leaked ? "🔴 YES" : "🟢 NO"} | cost=$${advCost.toFixed(4)}`);

    if (vanilla.leaked && !adv.leaked) {
      console.log(`  ★ Auditor CAUGHT the leak and cleaned the experience bank!`);
    }
    if (advBest >= vanillaBest && !adv.leaked) {
      console.log(`  ★ Clean experiences maintain or improve performance!`);
    }
    if (advBest < vanillaBest && vanilla.leaked) {
      console.log(`  ⚠ Performance dropped — vanilla's "improvement" was fake (memorization)`);
    }
    console.log("");
  }

  console.log(`\n${tracker.summary()}`);
}

main().catch(console.error);
