/**
 * GPT-5.4 same-domain train/test (all math).
 * Direct comparison with Gemini Flash same-domain results.
 *
 * Run: OPENROUTER_API_KEY=xxx npx tsx src/gpt54-same-domain.ts
 */
import { LLMModel, CostTracker } from "./core/llm-model.js";
import { ContainsEvaluator } from "./core/evaluator.js";
import { ExperienceStore } from "./core/store.js";
import { strictDistill } from "./frameworks/05b-strict-distill.js";
import { metaDistill } from "./frameworks/05c-meta-distill.js";
import { mathTrainTasks, mathTestTasks } from "./benchmarks/hle-math-split.js";
import type { Task } from "./core/types.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("Set OPENROUTER_API_KEY"); process.exit(1); }

const proxy = process.env.LLM_PROXY || "http://127.0.0.1:7890";
const tracker = new CostTracker();
const model = new LLMModel(apiKey, "openai/gpt-5.4", undefined, proxy, tracker);
const evaluator = new ContainsEvaluator();

function icon(s: number): string { return s >= 0.95 ? "██" : s >= 0.5 ? "▓▓" : "░░"; }

async function evalTask(task: Task, store?: ExperienceStore): Promise<number> {
  const ctx = store && store.count > 0
    ? `Learned principles:\n${store.toPromptString(15)}\n\n`
    : "";
  const content = await model.generate(`${ctx}Task: ${task.input}\nGive ONLY the answer, nothing else:`);
  return evaluator.evaluate(task, { taskId: task.id, content, round: 0 });
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  GPT-5.4 SAME-DOMAIN (ALL MATH) TRAIN/TEST                          ║");
  console.log("║  Train: 10 math HLE | Test: 5 unseen math HLE                       ║");
  console.log("║  Conditions: Baseline / Strict-Domain / Meta-Rules                   ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

  // ═══ TRAIN ═══
  console.log("═══ PHASE 1: TRAINING (10 math × 3 rounds) ═══\n");

  console.log("  [B] Strict Domain Rules...");
  const domainStore = new ExperienceStore();
  const dStart = tracker.totalCost;
  const { results: dResults } = await strictDistill(mathTrainTasks, model, evaluator, { maxRounds: 3 }, domainStore);
  const dCost = tracker.totalCost - dStart;
  for (const task of mathTrainTasks) {
    const scores = dResults.filter(r => r.taskId === task.id).map(r => r.bestSolution.score ?? 0);
    console.log(`    ${task.id.padEnd(12)} ${scores.map(icon).join("→")} best=${Math.max(...scores).toFixed(2)}`);
  }
  console.log(`    Rules: ${domainStore.count} | Cost: $${dCost.toFixed(4)}\n`);

  console.log("  [C] Meta-Level Rules...");
  const metaStore = new ExperienceStore();
  const mStart = tracker.totalCost;
  const mResults = await metaDistill(mathTrainTasks, model, evaluator, { maxRounds: 3 }, metaStore);
  const mCost = tracker.totalCost - mStart;
  for (const task of mathTrainTasks) {
    const scores = mResults.filter(r => r.taskId === task.id).map(r => r.bestSolution.score ?? 0);
    console.log(`    ${task.id.padEnd(12)} ${scores.map(icon).join("→")} best=${Math.max(...scores).toFixed(2)}`);
  }
  console.log(`    Rules: ${metaStore.count} | Cost: $${mCost.toFixed(4)}\n`);

  console.log("  Domain rules (top 3):");
  for (const e of domainStore.getTop(3)) console.log(`    [${e.source}] "${e.rule.slice(0, 75)}..."`);
  console.log("  Meta rules (top 3):");
  for (const e of metaStore.getTop(3)) console.log(`    [${e.source}] "${e.rule.slice(0, 75)}..."`);

  // ═══ TEST ═══
  console.log("\n═══ PHASE 2: TESTING (5 unseen math) ═══\n");
  console.log("  Task          │ [A] Base │ [B] Domain │ [C] Meta  │ Best");
  console.log("  ──────────────┼──────────┼────────────┼───────────┼─────");

  const rows: Array<{ task: string; base: number; domain: number; meta: number }> = [];
  for (const task of mathTestTasks) {
    const base = await evalTask(task);
    const domain = await evalTask(task, domainStore);
    const meta = await evalTask(task, metaStore);
    rows.push({ task: task.id, base, domain, meta });
    const best = Math.max(base, domain, meta);
    const w = best === meta && meta > base ? "C★" : best === domain && domain > base ? "B★" : "A";
    console.log(`  ${task.id.padEnd(14)} │ ${icon(base)} ${base.toFixed(2)}  │ ${icon(domain)} ${domain.toFixed(2)}    │ ${icon(meta)} ${meta.toFixed(2)}   │ ${w}`);
  }

  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const avgB = avg(rows.map(r => r.base));
  const avgD = avg(rows.map(r => r.domain));
  const avgM = avg(rows.map(r => r.meta));

  console.log("  ──────────────┼──────────┼────────────┼───────────┤");
  console.log(`  ${"AVERAGE".padEnd(14)} │    ${avgB.toFixed(2)}  │    ${avgD.toFixed(2)}    │    ${avgM.toFixed(2)}   │`);

  // ═══ COMPARISON WITH GEMINI ═══
  console.log("\n\n══════════════════════════════════════════════════════════════════");
  console.log("  GPT-5.4 vs GEMINI FLASH — Same-Domain Math Comparison");
  console.log("══════════════════════════════════════════════════════════════════\n");

  // Gemini results from previous experiment
  const gemBase = 0.25, gemDomain = 0.50, gemMeta = 0.25;
  console.log("                │ Gemini Flash │ GPT-5.4    │ Winner");
  console.log("  ──────────────┼──────────────┼────────────┼────────");
  console.log(`  Baseline      │    ${gemBase.toFixed(2)}       │    ${avgB.toFixed(2)}     │ ${avgB > gemBase ? "GPT-5.4" : gemBase > avgB ? "Gemini" : "Tie"}`);
  console.log(`  Domain rules  │    ${gemDomain.toFixed(2)}       │    ${avgD.toFixed(2)}     │ ${avgD > gemDomain ? "GPT-5.4" : gemDomain > avgD ? "Gemini" : "Tie"}`);
  console.log(`  Meta rules    │    ${gemMeta.toFixed(2)}       │    ${avgM.toFixed(2)}     │ ${avgM > gemMeta ? "GPT-5.4" : gemMeta > avgM ? "Gemini" : "Tie"}`);
  console.log(`  Domain lift   │   +${(gemDomain-gemBase).toFixed(2)}       │   +${(avgD-avgB).toFixed(2)}     │ ${(avgD-avgB) > (gemDomain-gemBase) ? "GPT lifts more" : "Gemini lifts more"}`);

  console.log(`\n  GPT-5.4 cost: Domain=$${dCost.toFixed(4)} | Meta=$${mCost.toFixed(4)}`);
  console.log(`  ${tracker.summary()}`);
}

main().catch(console.error);
