/**
 * TWO EXPERIMENTS IN ONE:
 *
 * Experiment 1: Same-domain train/test (all math)
 *   → Does experience transfer within mathematics?
 *
 * Experiment 2: Meta-rules vs domain-rules
 *   → Do abstract problem-solving strategies beat domain-specific rules?
 *
 * Conditions:
 *   A. Baseline (no experience)
 *   B. Strict domain rules (from previous experiment)
 *   C. Meta-level rules (new)
 *
 * Run: OPENROUTER_API_KEY=xxx npx tsx src/same-domain-experiment.ts
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
const model = new LLMModel(apiKey, "google/gemini-3-flash-preview", undefined, proxy, tracker);
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
  console.log("║  SAME-DOMAIN + META-RULES EXPERIMENT                                ║");
  console.log("║  Train: 10 math problems | Test: 5 different math problems           ║");
  console.log("║  Conditions: Baseline vs Strict-Domain vs Meta-Rules                 ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

  // ═══════════════════════════════════════
  // PHASE 1: TRAIN with both methods
  // ═══════════════════════════════════════
  console.log("═══ PHASE 1: TRAINING (10 math tasks × 3 rounds) ═══\n");

  // Train strict domain rules
  console.log("  Training [B] Strict Domain Rules...");
  const domainStore = new ExperienceStore();
  const dStart = tracker.totalCost;
  const { results: domainResults } = await strictDistill(mathTrainTasks, model, evaluator, { maxRounds: 3 }, domainStore);
  const dCost = tracker.totalCost - dStart;

  for (const task of mathTrainTasks) {
    const scores = domainResults.filter(r => r.taskId === task.id).map(r => r.bestSolution.score ?? 0);
    console.log(`    ${task.id.padEnd(12)} ${scores.map(icon).join("→")} best=${Math.max(...scores).toFixed(2)}`);
  }
  console.log(`    Domain rules: ${domainStore.count} | Cost: $${dCost.toFixed(4)}\n`);

  // Train meta rules
  console.log("  Training [C] Meta-Level Rules...");
  const metaStore = new ExperienceStore();
  const mStart = tracker.totalCost;
  const metaResults = await metaDistill(mathTrainTasks, model, evaluator, { maxRounds: 3 }, metaStore);
  const mCost = tracker.totalCost - mStart;

  for (const task of mathTrainTasks) {
    const scores = metaResults.filter(r => r.taskId === task.id).map(r => r.bestSolution.score ?? 0);
    console.log(`    ${task.id.padEnd(12)} ${scores.map(icon).join("→")} best=${Math.max(...scores).toFixed(2)}`);
  }
  console.log(`    Meta rules: ${metaStore.count} | Cost: $${mCost.toFixed(4)}\n`);

  // Show experience banks side by side
  console.log("  ┌─ Domain Rules (sample) ──────────────────────────");
  for (const e of domainStore.getTop(5)) {
    console.log(`  │ [${e.source}] "${e.rule.slice(0, 70)}..."`);
  }
  console.log("  └─────────────────────────────────────────────────\n");

  console.log("  ┌─ Meta Rules (sample) ────────────────────────────");
  for (const e of metaStore.getTop(5)) {
    console.log(`  │ [${e.source}] "${e.rule.slice(0, 70)}..."`);
  }
  console.log("  └─────────────────────────────────────────────────\n");

  // ═══════════════════════════════════════
  // PHASE 2: TEST on 5 unseen math problems
  // ═══════════════════════════════════════
  console.log("═══ PHASE 2: TESTING (5 unseen math tasks) ═══\n");

  console.log("  Task          │ [A] Base │ [B] Domain │ [C] Meta  │ Best");
  console.log("  ──────────────┼──────────┼────────────┼───────────┼─────");

  const rows: Array<{ task: string; base: number; domain: number; meta: number }> = [];

  for (const task of mathTestTasks) {
    const baseScore = await evalTask(task);
    const domainScore = await evalTask(task, domainStore);
    const metaScore = await evalTask(task, metaStore);

    rows.push({ task: task.id, base: baseScore, domain: domainScore, meta: metaScore });

    const best = Math.max(baseScore, domainScore, metaScore);
    const winner = best === metaScore && metaScore > baseScore ? "C★" :
                   best === domainScore && domainScore > baseScore ? "B★" :
                   best === baseScore ? "A" : "=";

    console.log(
      `  ${task.id.padEnd(14)} │ ${icon(baseScore)} ${baseScore.toFixed(2)}  │ ${icon(domainScore)} ${domainScore.toFixed(2)}    │ ${icon(metaScore)} ${metaScore.toFixed(2)}   │ ${winner}`
    );
  }

  // Averages
  const avgBase = rows.reduce((s, r) => s + r.base, 0) / rows.length;
  const avgDomain = rows.reduce((s, r) => s + r.domain, 0) / rows.length;
  const avgMeta = rows.reduce((s, r) => s + r.meta, 0) / rows.length;

  console.log("  ──────────────┼──────────┼────────────┼───────────┤");
  console.log(
    `  ${"AVERAGE".padEnd(14)} │    ${avgBase.toFixed(2)}  │    ${avgDomain.toFixed(2)}    │    ${avgMeta.toFixed(2)}   │`
  );

  // Deltas
  const domainDelta = avgDomain - avgBase;
  const metaDelta = avgMeta - avgBase;
  const metaVsDomain = avgMeta - avgDomain;

  console.log("\n\n══════════════════════════════════════════════════════════════════");
  console.log("                        RESULTS");
  console.log("══════════════════════════════════════════════════════════════════\n");

  console.log(`  [A] Baseline:      ${avgBase.toFixed(2)}`);
  console.log(`  [B] Domain rules:  ${avgDomain.toFixed(2)} (${domainDelta >= 0 ? "+" : ""}${domainDelta.toFixed(2)} vs baseline)`);
  console.log(`  [C] Meta rules:    ${avgMeta.toFixed(2)} (${metaDelta >= 0 ? "+" : ""}${metaDelta.toFixed(2)} vs baseline)`);
  console.log(`  Meta vs Domain:    ${metaVsDomain >= 0 ? "+" : ""}${metaVsDomain.toFixed(2)}\n`);

  // Per-task winners
  const domainWins = rows.filter(r => r.domain > r.base && r.domain >= r.meta).length;
  const metaWins = rows.filter(r => r.meta > r.base && r.meta > r.domain).length;
  const baseWins = rows.filter(r => r.base >= r.domain && r.base >= r.meta).length;
  const ties = rows.filter(r => r.base === r.domain && r.domain === r.meta).length;

  console.log(`  Task-level wins: Base=${baseWins} | Domain=${domainWins} | Meta=${metaWins} | Ties=${ties}`);

  // Verdict
  console.log("\n  VERDICT:");
  if (domainDelta > 0.05 || metaDelta > 0.05) {
    console.log("  ★ Same-domain experience DOES transfer!");
    if (metaDelta > domainDelta + 0.05) {
      console.log("  ★★ Meta-rules outperform domain rules!");
    } else if (domainDelta > metaDelta + 0.05) {
      console.log("  Domain rules outperform meta rules in same-domain transfer.");
    } else {
      console.log("  Domain and meta rules perform similarly.");
    }
  } else if (domainDelta < -0.05 || metaDelta < -0.05) {
    console.log("  ⚠ Experience HURTS performance even in same domain.");
  } else {
    console.log("  → Neutral: same-domain experience has no significant effect.");
  }

  console.log(`\n  Training cost: Domain=$${dCost.toFixed(4)} | Meta=$${mCost.toFixed(4)}`);
  console.log(`  Total: ${tracker.summary()}`);
}

main().catch(console.error);
