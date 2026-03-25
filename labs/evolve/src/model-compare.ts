/**
 * MODEL COMPARISON: GPT-5.4 vs Gemini 3 Flash
 * Same tasks, same frameworks — different base model.
 *
 * Tests the hypothesis: "scaffolding amplifies, not creates"
 * A stronger base model should benefit MORE from experience distillation.
 *
 * Run: OPENROUTER_API_KEY=xxx npx tsx src/model-compare.ts
 */
import { LLMModel, CostTracker } from "./core/llm-model.js";
import { ContainsEvaluator } from "./core/evaluator.js";
import { ExperienceStore } from "./core/store.js";
import { strictDistill } from "./frameworks/05b-strict-distill.js";
import { critiqueLock } from "./frameworks/09-critique-lock.js";
import { hleTasks, hleRound2Tasks } from "./benchmarks/tasks.js";
import type { Task } from "./core/types.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("Set OPENROUTER_API_KEY"); process.exit(1); }

const proxy = process.env.LLM_PROXY || "http://127.0.0.1:7890";

// Same tasks for both models
const tasks: Task[] = [
  hleTasks[0],        // philosophy (Arrhenius)
  hleTasks[2],        // activation functions
  hleTasks[3],        // physics (KK eigenvalues)
  hleRound2Tasks[0],  // knot theory
  hleRound2Tasks[2],  // fock space
];

function icon(s: number): string { return s >= 0.95 ? "██" : s >= 0.5 ? "▓▓" : "░░"; }

async function runModel(modelId: string, modelName: string) {
  const tracker = new CostTracker();
  const model = new LLMModel(apiKey!, modelId, undefined, proxy, tracker);
  const evaluator = new ContainsEvaluator();

  console.log(`\n  ═══ ${modelName} (${modelId}) ═══\n`);

  // Baseline: single shot
  console.log("  [A] Baseline (single shot):");
  const baseScores: number[] = [];
  for (const task of tasks) {
    const content = await model.generate(`Task: ${task.input}\nGive ONLY the answer, nothing else:`);
    const score = await evaluator.evaluate(task, { taskId: task.id, content, round: 0 });
    baseScores.push(score);
    console.log(`    ${task.id.padEnd(18)} ${icon(score)} ${score.toFixed(2)}`);
  }
  const avgBase = baseScores.reduce((s, v) => s + v, 0) / baseScores.length;
  console.log(`    Average: ${avgBase.toFixed(2)}\n`);

  // Strict distillation: train on same tasks × 3 rounds
  console.log("  [B] Strict Distill (3 rounds):");
  const store = new ExperienceStore();
  const { results } = await strictDistill(tasks, model, evaluator, { maxRounds: 3 }, store);
  const distillScores: number[] = [];
  for (const task of tasks) {
    const taskResults = results.filter(r => r.taskId === task.id);
    const scores = taskResults.map(r => r.bestSolution.score ?? 0);
    const best = Math.max(...scores, 0);
    distillScores.push(best);
    console.log(`    ${task.id.padEnd(18)} ${scores.map(icon).join("→")} best=${best.toFixed(2)}`);
  }
  const avgDistill = distillScores.reduce((s, v) => s + v, 0) / distillScores.length;
  console.log(`    Average best: ${avgDistill.toFixed(2)} | Rules: ${store.count}\n`);

  // CritiqueLock on each task
  console.log("  [C] CritiqueLock (4 rounds):");
  const critScores: number[] = [];
  for (const task of tasks) {
    const result = await critiqueLock(task, model, evaluator, { maxRounds: 4 });
    const best = result.bestSolution.score ?? 0;
    critScores.push(best);
    const scores = result.scoreHistory;
    console.log(`    ${task.id.padEnd(18)} ${scores.map(icon).join("→")} best=${best.toFixed(2)}`);
  }
  const avgCrit = critScores.reduce((s, v) => s + v, 0) / critScores.length;
  console.log(`    Average best: ${avgCrit.toFixed(2)}\n`);

  return {
    modelName, modelId,
    avgBase, avgDistill, avgCrit,
    baseScores, distillScores, critScores,
    cost: tracker.totalCost,
    calls: tracker.callCount,
    tokens: tracker.totalTokens,
  };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  MODEL COMPARISON: GPT-5.4 vs Gemini 3 Flash on HLE Tasks           ║");
  console.log("║  5 hard tasks × 3 conditions (Baseline / StrictDistill / CritLock)   ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  const gemini = await runModel("google/gemini-3-flash-preview", "Gemini 3 Flash");
  const gpt54 = await runModel("openai/gpt-5.4", "GPT-5.4");

  // Head-to-head comparison
  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("                    HEAD-TO-HEAD COMPARISON");
  console.log("══════════════════════════════════════════════════════════════════\n");

  console.log("                    │ Gemini Flash │ GPT-5.4    │ Winner");
  console.log("  ──────────────────┼──────────────┼────────────┼────────");
  console.log(`  [A] Baseline      │    ${gemini.avgBase.toFixed(2)}       │    ${gpt54.avgBase.toFixed(2)}     │ ${gemini.avgBase > gpt54.avgBase ? "Gemini" : gpt54.avgBase > gemini.avgBase ? "GPT-5.4" : "Tie"}`);
  console.log(`  [B] StrictDistill │    ${gemini.avgDistill.toFixed(2)}       │    ${gpt54.avgDistill.toFixed(2)}     │ ${gemini.avgDistill > gpt54.avgDistill ? "Gemini" : gpt54.avgDistill > gemini.avgDistill ? "GPT-5.4" : "Tie"}`);
  console.log(`  [C] CritiqueLock  │    ${gemini.avgCrit.toFixed(2)}       │    ${gpt54.avgCrit.toFixed(2)}     │ ${gemini.avgCrit > gpt54.avgCrit ? "Gemini" : gpt54.avgCrit > gemini.avgCrit ? "GPT-5.4" : "Tie"}`);

  const geminiLift = gemini.avgDistill - gemini.avgBase;
  const gptLift = gpt54.avgDistill - gpt54.avgBase;
  console.log(`\n  Distill lift:     │   ${geminiLift >= 0 ? "+" : ""}${geminiLift.toFixed(2)}       │   ${gptLift >= 0 ? "+" : ""}${gptLift.toFixed(2)}     │ ${Math.abs(gptLift) > Math.abs(geminiLift) ? "GPT-5.4 lifts more" : "Gemini lifts more"}`);

  console.log(`\n  Cost:             │   $${gemini.cost.toFixed(4)}     │   $${gpt54.cost.toFixed(4)}   │`);
  console.log(`  Calls:            │   ${gemini.calls}           │   ${gpt54.calls}          │`);
  console.log(`  Tokens:           │   ${gemini.tokens.toLocaleString().padStart(8)}    │   ${gpt54.tokens.toLocaleString().padStart(8)}  │`);

  // Per-task breakdown
  console.log("\n\n  Per-task baseline comparison:");
  for (let i = 0; i < tasks.length; i++) {
    const g = gemini.baseScores[i];
    const p = gpt54.baseScores[i];
    const w = g > p ? "←G" : p > g ? "P→" : "==";
    console.log(`    ${tasks[i].id.padEnd(18)} Gemini ${icon(g)} ${g.toFixed(2)} vs GPT ${icon(p)} ${p.toFixed(2)}  ${w}`);
  }

  // Hypothesis test
  console.log("\n\n══════════════════════════════════════════════════════════════════");
  console.log("  HYPOTHESIS: 'Stronger model benefits more from scaffolding'");
  console.log("══════════════════════════════════════════════════════════════════\n");
  if (gpt54.avgBase > gemini.avgBase && gptLift > geminiLift) {
    console.log("  ★ CONFIRMED: GPT-5.4 is stronger AND lifts more from distillation.");
  } else if (gpt54.avgBase > gemini.avgBase && gptLift <= geminiLift) {
    console.log("  ✗ REJECTED: GPT-5.4 is stronger but lifts LESS from distillation.");
    console.log("  → Stronger models may already 'know' what distillation teaches.");
  } else if (gpt54.avgBase <= gemini.avgBase && gptLift > geminiLift) {
    console.log("  ? MIXED: GPT-5.4 not stronger at baseline but benefits more.");
  } else {
    console.log("  → Gemini outperforms GPT-5.4 in this test. Need larger sample.");
  }
}

main().catch(console.error);
