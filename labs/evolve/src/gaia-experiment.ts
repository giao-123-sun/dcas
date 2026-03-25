/**
 * GAIA-style multi-step reasoning experiment.
 *
 * Key question: do frameworks help on PRACTICAL multi-step tasks
 * (not just academic knowledge questions)?
 *
 * Train: 10 multi-step reasoning tasks × 3 rounds
 * Test:  5 unseen multi-step tasks
 * Conditions: Baseline / Strict-Domain / Meta-Rules / CritiqueLock
 *
 * Run: OPENROUTER_API_KEY=xxx npx tsx src/gaia-experiment.ts
 */
import { LLMModel, CostTracker } from "./core/llm-model.js";
import { ContainsEvaluator } from "./core/evaluator.js";
import { ExperienceStore } from "./core/store.js";
import { strictDistill } from "./frameworks/05b-strict-distill.js";
import { metaDistill } from "./frameworks/05c-meta-distill.js";
import { critiqueLock } from "./frameworks/09-critique-lock.js";
import { gaiaTrainTasks, gaiaTestTasks } from "./benchmarks/gaia-style-tasks.js";
import type { Task } from "./core/types.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("Set OPENROUTER_API_KEY"); process.exit(1); }

const proxy = process.env.LLM_PROXY || "http://127.0.0.1:7890";
const tracker = new CostTracker();
const model = new LLMModel(apiKey, "google/gemini-3-flash-preview", undefined, proxy, tracker);
const evaluator = new ContainsEvaluator();

function icon(s: number): string { return s >= 0.95 ? "██" : s >= 0.5 ? "▓▓" : "░░"; }

async function evalTask(task: Task, store?: ExperienceStore): Promise<{ score: number; answer: string }> {
  const ctx = store && store.count > 0
    ? `Problem-solving principles:\n${store.toPromptString(10)}\n\n`
    : "";
  const content = await model.generate(
    `${ctx}Think step by step, then give ONLY the final answer on the last line.\n\nTask: ${task.input}`
  );
  // Extract last line as answer
  const lines = content.trim().split("\n");
  const answer = lines[lines.length - 1].trim();
  const score = await evaluator.evaluate(task, { taskId: task.id, content: answer, round: 0 });
  return { score, answer };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  GAIA-STYLE MULTI-STEP REASONING EXPERIMENT                         ║");
  console.log("║  Model: gemini-3-flash-preview                                      ║");
  console.log("║  Train: 10 practical tasks | Test: 5 unseen practical tasks          ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

  // ═══ PHASE 1: TRAIN ═══
  console.log("═══ PHASE 1: TRAINING ═══\n");

  // Domain rules
  console.log("  [B] Strict Domain Rules (3 rounds)...");
  const domainStore = new ExperienceStore();
  const dStart = tracker.totalCost;
  const { results: dResults } = await strictDistill(gaiaTrainTasks, model, evaluator, { maxRounds: 3 }, domainStore);
  const dCost = tracker.totalCost - dStart;
  for (const task of gaiaTrainTasks) {
    const scores = dResults.filter(r => r.taskId === task.id).map(r => r.bestSolution.score ?? 0);
    console.log(`    ${task.id.padEnd(15)} ${scores.map(icon).join("→")} best=${Math.max(...scores).toFixed(2)}`);
  }
  console.log(`    Rules: ${domainStore.count} | Cost: $${dCost.toFixed(4)}\n`);

  // Meta rules
  console.log("  [C] Meta-Level Rules (3 rounds)...");
  const metaStore = new ExperienceStore();
  const mStart = tracker.totalCost;
  const mResults = await metaDistill(gaiaTrainTasks, model, evaluator, { maxRounds: 3 }, metaStore);
  const mCost = tracker.totalCost - mStart;
  for (const task of gaiaTrainTasks) {
    const scores = mResults.filter(r => r.taskId === task.id).map(r => r.bestSolution.score ?? 0);
    console.log(`    ${task.id.padEnd(15)} ${scores.map(icon).join("→")} best=${Math.max(...scores).toFixed(2)}`);
  }
  console.log(`    Rules: ${metaStore.count} | Cost: $${mCost.toFixed(4)}\n`);

  // Show rules
  console.log("  Domain rules (top 3):");
  for (const e of domainStore.getTop(3)) console.log(`    [${e.source}] "${e.rule.slice(0, 75)}..."`);
  console.log("  Meta rules (top 3):");
  for (const e of metaStore.getTop(3)) console.log(`    [${e.source}] "${e.rule.slice(0, 75)}..."`);
  console.log("");

  // ═══ PHASE 2: TEST ═══
  console.log("═══ PHASE 2: TESTING (5 unseen tasks) ═══\n");

  console.log("  Task            │ [A] Base │ [B] Domain │ [C] Meta  │ [D] CritLock │ Best");
  console.log("  ────────────────┼──────────┼────────────┼───────────┼──────────────┼─────");

  const rows: Array<{ task: string; base: number; domain: number; meta: number; critique: number }> = [];

  for (const task of gaiaTestTasks) {
    const base = await evalTask(task);
    const domain = await evalTask(task, domainStore);
    const meta = await evalTask(task, metaStore);
    const crit = await critiqueLock(task, model, evaluator, { maxRounds: 3 });
    const critScore = crit.bestSolution.score ?? 0;

    rows.push({ task: task.id, base: base.score, domain: domain.score, meta: meta.score, critique: critScore });

    const best = Math.max(base.score, domain.score, meta.score, critScore);
    const winner = best === critScore && critScore > base.score ? "D★" :
                   best === meta.score && meta.score > base.score ? "C★" :
                   best === domain.score && domain.score > base.score ? "B★" : "A";

    console.log(
      `  ${task.id.padEnd(16)} │ ${icon(base.score)} ${base.score.toFixed(2)}  │ ${icon(domain.score)} ${domain.score.toFixed(2)}    │ ${icon(meta.score)} ${meta.score.toFixed(2)}   │ ${icon(critScore)} ${critScore.toFixed(2)}      │ ${winner}`
    );
  }

  // Averages
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const avgB = avg(rows.map(r => r.base));
  const avgD = avg(rows.map(r => r.domain));
  const avgM = avg(rows.map(r => r.meta));
  const avgC = avg(rows.map(r => r.critique));

  console.log("  ────────────────┼──────────┼────────────┼───────────┼──────────────┤");
  console.log(
    `  ${"AVERAGE".padEnd(16)} │    ${avgB.toFixed(2)}  │    ${avgD.toFixed(2)}    │    ${avgM.toFixed(2)}   │    ${avgC.toFixed(2)}      │`
  );

  // Verdict
  console.log("\n\n══════════════════════════════════════════════════════════════════");
  console.log("                        RESULTS");
  console.log("══════════════════════════════════════════════════════════════════\n");

  console.log(`  [A] Baseline:      ${avgB.toFixed(2)}`);
  console.log(`  [B] Domain rules:  ${avgD.toFixed(2)} (${(avgD - avgB >= 0 ? "+" : "")}${(avgD - avgB).toFixed(2)} vs baseline)`);
  console.log(`  [C] Meta rules:    ${avgM.toFixed(2)} (${(avgM - avgB >= 0 ? "+" : "")}${(avgM - avgB).toFixed(2)} vs baseline)`);
  console.log(`  [D] CritiqueLock:  ${avgC.toFixed(2)} (${(avgC - avgB >= 0 ? "+" : "")}${(avgC - avgB).toFixed(2)} vs baseline)`);

  const bestMethod = avgD >= avgM && avgD >= avgC ? "Domain" : avgM >= avgC ? "Meta" : "CritiqueLock";
  console.log(`\n  Best method: ${bestMethod}`);
  console.log(`  Training cost: Domain=$${dCost.toFixed(4)} | Meta=$${mCost.toFixed(4)}`);
  console.log(`  Total: ${tracker.summary()}`);
}

main().catch(console.error);
