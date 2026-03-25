/**
 * PROPER TRAIN/TEST EXPERIMENT
 *
 * Phase 1: Train on 10 questions × 3 rounds (strict distillation)
 *          → accumulate experience bank
 * Phase 2: Test on 5 UNSEEN questions
 *          Condition A: baseline (no experience)
 *          Condition B: with accumulated experience bank
 *
 * This tests whether distilled experiences TRANSFER to new problems.
 *
 * Run: OPENROUTER_API_KEY=xxx npx tsx src/train-test.ts
 */
import { LLMModel, CostTracker } from "./core/llm-model.js";
import { ContainsEvaluator } from "./core/evaluator.js";
import { ExperienceStore } from "./core/store.js";
import { strictDistill } from "./frameworks/05b-strict-distill.js";
import { trainTasks, testTasks } from "./benchmarks/hle-train-test.js";
import type { Task } from "./core/types.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("Set OPENROUTER_API_KEY"); process.exit(1); }

const proxy = process.env.LLM_PROXY || "http://127.0.0.1:7890";
const tracker = new CostTracker();
const model = new LLMModel(apiKey, "google/gemini-3-flash-preview", undefined, proxy, tracker);
const evaluator = new ContainsEvaluator();

function scoreIcon(s: number): string {
  return s >= 0.95 ? "██" : s >= 0.5 ? "▓▓" : "░░";
}

async function evaluateBaseline(task: Task): Promise<number> {
  const content = await model.generate(`Task: ${task.input}\nGive ONLY the answer, nothing else:`);
  return evaluator.evaluate(task, { taskId: task.id, content, round: 0 });
}

async function evaluateWithExperience(task: Task, store: ExperienceStore): Promise<number> {
  const ctx = store.count > 0 ? `Learned reasoning principles:\n${store.toPromptString()}\n\n` : "";
  const content = await model.generate(`${ctx}Task: ${task.input}\nGive ONLY the answer, nothing else:`);
  return evaluator.evaluate(task, { taskId: task.id, content, round: 0 });
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║   TRAIN/TEST EXPERIMENT: Does Experience Transfer?              ║");
  console.log("║   Train: 10 HLE questions × 3 rounds (strict distillation)     ║");
  console.log("║   Test:  5 UNSEEN questions (baseline vs with-experience)       ║");
  console.log("║   Model: google/gemini-3-flash-preview                          ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");

  // ========================================
  // PHASE 1: TRAINING
  // ========================================
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("  PHASE 1: TRAINING (10 tasks × 3 rounds, strict distillation)");
  console.log("══════════════════════════════════════════════════════════════════\n");

  const expStore = new ExperienceStore();
  const trainCostStart = tracker.totalCost;

  const { results: trainResults, auditLog } = await strictDistill(
    trainTasks, model, evaluator, { maxRounds: 3 }, expStore,
  );

  const trainCost = tracker.totalCost - trainCostStart;
  const rejected = auditLog.filter(a => !a.accepted).length;
  const accepted = auditLog.filter(a => a.accepted).length;

  // Show per-task training trajectories
  for (const task of trainTasks) {
    const taskResults = trainResults.filter(r => r.taskId === task.id);
    const scores = taskResults.map(r => r.bestSolution.score ?? 0);
    const trajectory = scores.map(scoreIcon).join("→");
    const best = Math.max(...scores, 0);
    console.log(`  ${task.id.padEnd(12)} ${trajectory} best=${best.toFixed(2)} | ${task.description}`);
  }

  console.log(`\n  Training complete.`);
  console.log(`  Experiences: ${expStore.count} accepted, ${rejected} rejected`);
  console.log(`  Cost: $${trainCost.toFixed(4)}`);

  // Show accumulated experiences
  console.log(`\n  ┌─ Experience Bank (${expStore.count} rules) ────────────────────`);
  for (const exp of expStore.getAll()) {
    console.log(`  │ [${exp.source}] "${exp.rule.slice(0, 75)}..."`);
  }
  console.log(`  └──────────────────────────────────────────────────────\n`);

  // ========================================
  // PHASE 2: TESTING
  // ========================================
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("  PHASE 2: TESTING (5 unseen tasks)");
  console.log("  Condition A: Baseline (no experience)");
  console.log("  Condition B: With training experience bank");
  console.log("══════════════════════════════════════════════════════════════════\n");

  const testCostStart = tracker.totalCost;
  const testResults: Array<{ task: string; baseline: number; withExp: number; delta: number }> = [];

  console.log("  Task          │ Baseline │ WithExp  │ Delta  │ Description");
  console.log("  ──────────────┼──────────┼──────────┼────────┼──────────────────────");

  for (const task of testTasks) {
    const baselineScore = await evaluateBaseline(task);
    const withExpScore = await evaluateWithExperience(task, expStore);
    const delta = withExpScore - baselineScore;

    testResults.push({ task: task.id, baseline: baselineScore, withExp: withExpScore, delta });

    const deltaStr = delta > 0 ? `↑+${delta.toFixed(2)}` : delta < 0 ? `↓${delta.toFixed(2)}` : `→ 0.00`;
    const deltaColor = delta > 0 ? "★" : delta < 0 ? "⚠" : " ";
    console.log(
      `  ${task.id.padEnd(14)} │ ${scoreIcon(baselineScore)} ${baselineScore.toFixed(2)}  │ ${scoreIcon(withExpScore)} ${withExpScore.toFixed(2)}  │ ${deltaStr.padStart(6)} ${deltaColor}│ ${task.description}`
    );
  }

  const testCost = tracker.totalCost - testCostStart;

  // Summary
  const avgBaseline = testResults.reduce((s, r) => s + r.baseline, 0) / testResults.length;
  const avgWithExp = testResults.reduce((s, r) => s + r.withExp, 0) / testResults.length;
  const avgDelta = avgWithExp - avgBaseline;
  const improved = testResults.filter(r => r.delta > 0).length;
  const degraded = testResults.filter(r => r.delta < 0).length;
  const unchanged = testResults.filter(r => r.delta === 0).length;

  console.log("  ──────────────┼──────────┼──────────┼────────┤");
  console.log(
    `  ${"AVERAGE".padEnd(14)} │    ${avgBaseline.toFixed(2)}   │    ${avgWithExp.toFixed(2)}   │ ${(avgDelta >= 0 ? "+" : "") + avgDelta.toFixed(2).padStart(5)} │`
  );

  console.log("\n\n══════════════════════════════════════════════════════════════════");
  console.log("                        FINAL VERDICT");
  console.log("══════════════════════════════════════════════════════════════════\n");

  console.log(`  Training: 10 tasks × 3 rounds | ${expStore.count} clean experiences | $${trainCost.toFixed(4)}`);
  console.log(`  Testing:  5 unseen tasks | $${testCost.toFixed(4)}`);
  console.log(`  Total cost: $${(trainCost + testCost).toFixed(4)}\n`);

  console.log(`  Baseline avg:       ${avgBaseline.toFixed(2)}`);
  console.log(`  With-experience avg: ${avgWithExp.toFixed(2)}`);
  console.log(`  Delta:              ${(avgDelta >= 0 ? "+" : "")}${avgDelta.toFixed(2)}\n`);

  console.log(`  Improved: ${improved}/5 | Degraded: ${degraded}/5 | Unchanged: ${unchanged}/5\n`);

  if (avgDelta > 0.05) {
    console.log("  ★ EXPERIENCE TRANSFERS! Clean rules improve unseen problems.");
  } else if (avgDelta > -0.05) {
    console.log("  → Neutral: experience neither helps nor hurts on unseen problems.");
  } else {
    console.log("  ⚠ Experience HURTS: rules from training interfere with test problems.");
  }

  console.log(`\n  ${tracker.summary()}`);
}

main().catch(console.error);
