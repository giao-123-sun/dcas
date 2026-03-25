/**
 * Ablation study: Vanilla vs Strict Distillation
 *
 * Conditions:
 *   A. Vanilla Distillation (no filtering, no warning)
 *   B. Strict Distillation (warned + hard-filtered)
 *
 * Question: does telling the model its leaks will be blocked
 * change the QUALITY of distilled rules and final performance?
 *
 * Run: OPENROUTER_API_KEY=xxx npx tsx src/ablation.ts
 */
import { LLMModel, CostTracker } from "./core/llm-model.js";
import { ContainsEvaluator } from "./core/evaluator.js";
import { hleTasks, hleRound2Tasks } from "./benchmarks/tasks.js";
import { experienceDistill } from "./frameworks/04-experience-distill.js";
import { strictDistill } from "./frameworks/05b-strict-distill.js";
import { ExperienceStore } from "./core/store.js";
import type { Task, Experience } from "./core/types.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("Set OPENROUTER_API_KEY"); process.exit(1); }

const proxy = process.env.LLM_PROXY || "http://127.0.0.1:7890";
const tracker = new CostTracker();
const model = new LLMModel(apiKey, "google/gemini-3-flash-preview", undefined, proxy, tracker);
const evaluator = new ContainsEvaluator();

// Same tasks from original audit
const tasks: Task[] = [
  hleTasks[0],         // philosophy (known leaker)
  hleTasks[3],         // physics (known clean)
  hleRound2Tasks[0],   // knot theory
  hleRound2Tasks[2],   // fock space
];

function checkLeak(exp: Experience, task: Task): boolean {
  const answer = (task.expectedAnswer ?? "").toLowerCase();
  if (answer.length < 2) return false;
  return exp.rule.toLowerCase().includes(answer);
}

function scoreBar(s: number): string {
  return s >= 0.95 ? "██" : s >= 0.5 ? "▓▓" : "░░";
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║     ABLATION STUDY: Vanilla vs Strict Experience Distillation    ║");
  console.log("║     Does warning + hard-filtering change learning quality?       ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");

  const summary: Array<{
    task: string;
    vanillaScores: number[];
    strictScores: number[];
    vanillaLeaks: number;
    strictLeaks: number;
    vanillaExps: number;
    strictExps: number;
    strictRejected: number;
    vanillaCost: number;
    strictCost: number;
  }> = [];

  for (const task of tasks) {
    console.log(`\n━━━ ${task.id} (expected: ${task.expectedAnswer}) ━━━`);
    console.log(`Q: "${task.input.slice(0, 80)}..."\n`);

    // === Condition A: Vanilla ===
    const vanillaStore = new ExperienceStore();
    const vStart = tracker.totalCost;
    const vanillaResults = await experienceDistill([task], model, evaluator, { maxRounds: 3 }, vanillaStore);
    const vCost = tracker.totalCost - vStart;
    const vScores = vanillaResults.map(r => r.bestSolution.score ?? 0);
    const vExps = vanillaStore.getAll();
    const vLeaks = vExps.filter(e => checkLeak(e, task)).length;

    console.log(`  [A] Vanilla:  ${vScores.map(scoreBar).join("→")} (${vScores.map(s=>s.toFixed(2)).join("→")})`);
    console.log(`      Exps: ${vExps.length} | Leaks: ${vLeaks}/${vExps.length} | Cost: $${vCost.toFixed(4)}`);
    for (const e of vExps) {
      const flag = checkLeak(e, task) ? " ⚠️" : " ✓";
      console.log(`      ${flag} "${e.rule.slice(0, 80)}..."`);
    }

    // === Condition B: Strict ===
    const strictStore = new ExperienceStore();
    const sStart = tracker.totalCost;
    const { results: strictResults, auditLog } = await strictDistill([task], model, evaluator, { maxRounds: 3 }, strictStore);
    const sCost = tracker.totalCost - sStart;
    const sScores = strictResults.map(r => r.bestSolution.score ?? 0);
    const sExps = strictStore.getAll();
    const sLeaks = sExps.filter(e => checkLeak(e, task)).length;
    const rejected = auditLog.filter(a => !a.accepted).length;

    console.log(`\n  [B] Strict:   ${sScores.map(scoreBar).join("→")} (${sScores.map(s=>s.toFixed(2)).join("→")})`);
    console.log(`      Exps: ${sExps.length} | Leaks: ${sLeaks}/${sExps.length} | Rejected: ${rejected} | Cost: $${sCost.toFixed(4)}`);
    for (const e of sExps) {
      const flag = checkLeak(e, task) ? " ⚠️" : " ✓";
      console.log(`      ${flag} "${e.rule.slice(0, 80)}..."`);
    }
    for (const a of auditLog.filter(x => !x.accepted && x.taskId === task.id)) {
      console.log(`      🚫 REJECTED: "${a.rule.slice(0, 60)}..." (${a.reason})`);
    }

    summary.push({
      task: task.id,
      vanillaScores: vScores,
      strictScores: sScores,
      vanillaLeaks: vLeaks,
      strictLeaks: sLeaks,
      vanillaExps: vExps.length,
      strictExps: sExps.length,
      strictRejected: rejected,
      vanillaCost: vCost,
      strictCost: sCost,
    });
  }

  // === SUMMARY TABLE ===
  console.log("\n\n══════════════════════════════════════════════════════════════════");
  console.log("                    ABLATION RESULTS");
  console.log("══════════════════════════════════════════════════════════════════\n");

  console.log("Task            │ Vanilla Best │ Strict Best │ V.Leaks │ S.Leaks │ Rejected");
  console.log("────────────────┼──────────────┼─────────────┼─────────┼─────────┼─────────");

  for (const s of summary) {
    const vBest = Math.max(...s.vanillaScores).toFixed(2);
    const sBest = Math.max(...s.strictScores).toFixed(2);
    console.log(
      `${s.task.padEnd(15)} │     ${vBest}     │    ${sBest}     │  ${s.vanillaLeaks}/${s.vanillaExps}    │  ${s.strictLeaks}/${s.strictExps}    │    ${s.strictRejected}`
    );
  }

  const vAvg = summary.reduce((s, r) => s + Math.max(...r.vanillaScores), 0) / summary.length;
  const sAvg = summary.reduce((s, r) => s + Math.max(...r.strictScores), 0) / summary.length;
  const vTotalLeaks = summary.reduce((s, r) => s + r.vanillaLeaks, 0);
  const sTotalLeaks = summary.reduce((s, r) => s + r.strictLeaks, 0);
  const vTotalExps = summary.reduce((s, r) => s + r.vanillaExps, 0);
  const sTotalExps = summary.reduce((s, r) => s + r.strictExps, 0);
  const totalRejected = summary.reduce((s, r) => s + r.strictRejected, 0);

  console.log("────────────────┼──────────────┼─────────────┼─────────┼─────────┼─────────");
  console.log(
    `${"AVERAGE".padEnd(15)} │     ${vAvg.toFixed(2)}     │    ${sAvg.toFixed(2)}     │  ${vTotalLeaks}/${vTotalExps}    │  ${sTotalLeaks}/${sTotalExps}    │    ${totalRejected}`
  );

  console.log(`\n\nVanilla cost: $${summary.reduce((s, r) => s + r.vanillaCost, 0).toFixed(4)}`);
  console.log(`Strict cost:  $${summary.reduce((s, r) => s + r.strictCost, 0).toFixed(4)}`);
  console.log(`\n${tracker.summary()}`);

  // Verdict
  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("                      VERDICT");
  console.log("══════════════════════════════════════════════════════════════════");
  if (sTotalLeaks < vTotalLeaks) {
    console.log(`\n  Strict reduced leakage from ${vTotalLeaks}/${vTotalExps} to ${sTotalLeaks}/${sTotalExps}`);
  }
  if (sAvg >= vAvg * 0.9) {
    console.log(`  Performance maintained: ${sAvg.toFixed(2)} vs ${vAvg.toFixed(2)} (${((sAvg/vAvg)*100).toFixed(0)}%)`);
  } else {
    console.log(`  Performance dropped: ${sAvg.toFixed(2)} vs ${vAvg.toFixed(2)} (${((sAvg/vAvg)*100).toFixed(0)}%)`);
    console.log(`  → Some of vanilla's "performance" was fake (answer memorization)`);
  }
  console.log("");
}

main().catch(console.error);
