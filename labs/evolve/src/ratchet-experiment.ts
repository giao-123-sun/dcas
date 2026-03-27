/**
 * REFLEXION-RATCHET vs previous best frameworks.
 * Same-domain math, 10 train + 5 test.
 *
 * Tests: does compound memory (reflection + strategy + experience + ratchet)
 * outperform single-mechanism frameworks?
 *
 * Run: OPENROUTER_API_KEY=xxx npx tsx src/ratchet-experiment.ts
 */
import { LLMModel, CostTracker } from "./core/llm-model.js";
import { ContainsEvaluator } from "./core/evaluator.js";
import { ExperienceStore } from "./core/store.js";
import { ReflectionMemory } from "./core/reflection-memory.js";
import { StrategyLibrary } from "./core/strategy-library.js";
import { strictDistill } from "./frameworks/05b-strict-distill.js";
import { critiqueLock } from "./frameworks/09-critique-lock.js";
import { reflexionRatchet } from "./frameworks/11-reflexion-ratchet.js";
import { mathTrainTasks, mathTestTasks } from "./benchmarks/hle-math-split.js";
import type { Task } from "./core/types.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("Set OPENROUTER_API_KEY"); process.exit(1); }
const proxy = process.env.LLM_PROXY || "http://127.0.0.1:7890";
const tracker = new CostTracker();
const model = new LLMModel(apiKey, "google/gemini-3-flash-preview", undefined, proxy, tracker);
const evaluator = new ContainsEvaluator();

function icon(s: number): string { return s >= 0.95 ? "██" : s >= 0.5 ? "▓▓" : "░░"; }

async function evalTask(task: Task, ctx: string): Promise<number> {
  const content = await model.generate(`${ctx}Task: ${task.input}\nGive ONLY the answer, nothing else:`);
  return evaluator.evaluate(task, { taskId: task.id, content, round: 0 });
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  REFLEXION-RATCHET vs STRICT-DISTILL vs CRITIQUE-LOCK               ║");
  console.log("║  Same-domain math: 10 train + 5 test | Gemini Flash                 ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

  // === TRAIN PHASE ===
  console.log("═══ TRAINING (10 math × 3 rounds) ═══\n");

  // A: Strict Distill
  console.log("  [A] Strict Distill...");
  const strictStore = new ExperienceStore();
  const aStart = tracker.totalCost;
  const { results: strictResults } = await strictDistill(mathTrainTasks, model, evaluator, { maxRounds: 3 }, strictStore);
  const aCost = tracker.totalCost - aStart;
  for (const t of mathTrainTasks) {
    const sc = strictResults.filter(r => r.taskId === t.id).map(r => r.bestSolution.score ?? 0);
    console.log(`    ${t.id.padEnd(12)} ${sc.map(icon).join("→")} best=${Math.max(...sc).toFixed(2)}`);
  }
  console.log(`    Rules: ${strictStore.count} | Cost: $${aCost.toFixed(4)}\n`);

  // B: Reflexion Ratchet
  console.log("  [B] Reflexion-Ratchet...");
  const refMem = new ReflectionMemory();
  const stratLib = new StrategyLibrary();
  const ratchetExpStore = new ExperienceStore();
  const bStart = tracker.totalCost;
  const ratchetResults = await reflexionRatchet(mathTrainTasks, model, evaluator, { maxRounds: 3 }, refMem, stratLib, ratchetExpStore);
  const bCost = tracker.totalCost - bStart;
  for (const t of mathTrainTasks) {
    const sc = ratchetResults.filter(r => r.taskId === t.id).map(r => r.bestSolution.score ?? 0);
    console.log(`    ${t.id.padEnd(12)} ${sc.map(icon).join("→")} best=${Math.max(...sc).toFixed(2)}`);
  }
  console.log(`    Reflections: ${refMem.count} | Strategies: ${stratLib.count} | Rules: ${ratchetExpStore.count} | Cost: $${bCost.toFixed(4)}\n`);

  // Show memory contents
  console.log("  ┌─ Reflexion Memory (sample) ────────────────");
  for (const r of refMem.getAll().slice(0, 3)) {
    console.log(`  │ ${r.wasCorrect ? "✓" : "✗"} "${r.reflection.slice(0, 70)}..."`);
  }
  console.log("  └─────────────────────────────────────────────");
  console.log("  ┌─ Strategy Library (top 3) ──────────────────");
  for (const s of stratLib.getTop(3)) {
    console.log(`  │ [${s.score.toFixed(2)}] "${s.strategy.slice(0, 70)}..."`);
  }
  console.log("  └─────────────────────────────────────────────\n");

  // === TEST PHASE ===
  console.log("═══ TESTING (5 unseen math) ═══\n");
  console.log("  Task          │ [0] Base │ [A] Strict │ [B] Ratchet │ [C] CritLck │ Best");
  console.log("  ──────────────┼──────────┼────────────┼─────────────┼─────────────┼─────");

  const rows: Array<{ task: string; base: number; strict: number; ratchet: number; critlock: number }> = [];

  for (const task of mathTestTasks) {
    const base = await evalTask(task, "");
    const strict = await evalTask(task, strictStore.count > 0 ? `Rules:\n${strictStore.toPromptString()}\n\n` : "");

    // Ratchet uses all three memory stores
    const refCtx = refMem.toPromptString(task);
    const stratCtx = stratLib.toPromptString(task.input);
    const expCtx = ratchetExpStore.count > 0 ? `Rules:\n${ratchetExpStore.toPromptString()}\n` : "";
    const ratchetCtx = [refCtx, stratCtx, expCtx].filter(s => s).join("\n");
    const ratchet = await evalTask(task, ratchetCtx);

    const critResult = await critiqueLock(task, model, evaluator, { maxRounds: 3 });
    const critlock = critResult.bestSolution.score ?? 0;

    rows.push({ task: task.id, base, strict, ratchet, critlock });

    const best = Math.max(base, strict, ratchet, critlock);
    const w = best === ratchet && ratchet > base ? "B★" :
              best === strict && strict > base ? "A★" :
              best === critlock && critlock > base ? "C★" : "0";
    console.log(
      `  ${task.id.padEnd(14)} │ ${icon(base)} ${base.toFixed(2)}  │ ${icon(strict)} ${strict.toFixed(2)}    │ ${icon(ratchet)} ${ratchet.toFixed(2)}     │ ${icon(critlock)} ${critlock.toFixed(2)}     │ ${w}`
    );
  }

  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const avgBase = avg(rows.map(r => r.base));
  const avgStrict = avg(rows.map(r => r.strict));
  const avgRatchet = avg(rows.map(r => r.ratchet));
  const avgCrit = avg(rows.map(r => r.critlock));

  console.log("  ──────────────┼──────────┼────────────┼─────────────┼─────────────┤");
  console.log(`  ${"AVERAGE".padEnd(14)} │    ${avgBase.toFixed(2)}  │    ${avgStrict.toFixed(2)}    │    ${avgRatchet.toFixed(2)}     │    ${avgCrit.toFixed(2)}     │`);

  console.log("\n\n══════════════════════════════════════════════════════════════════");
  console.log("                        RESULTS");
  console.log("══════════════════════════════════════════════════════════════════\n");
  console.log(`  [0] Baseline:       ${avgBase.toFixed(2)}`);
  console.log(`  [A] Strict Distill: ${avgStrict.toFixed(2)} (${(avgStrict-avgBase>=0?"+":"")}${(avgStrict-avgBase).toFixed(2)} vs base) | $${aCost.toFixed(4)}`);
  console.log(`  [B] Ratchet:        ${avgRatchet.toFixed(2)} (${(avgRatchet-avgBase>=0?"+":"")}${(avgRatchet-avgBase).toFixed(2)} vs base) | $${bCost.toFixed(4)}`);
  console.log(`  [C] CritiqueLock:   ${avgCrit.toFixed(2)} (${(avgCrit-avgBase>=0?"+":"")}${(avgCrit-avgBase).toFixed(2)} vs base)`);

  const winner = avgRatchet > avgStrict && avgRatchet > avgCrit ? "Reflexion-Ratchet" :
                 avgStrict > avgCrit ? "Strict Distill" : "CritiqueLock";
  console.log(`\n  Winner: ${winner}`);

  if (avgRatchet > avgStrict) {
    console.log("  ★ Compound memory outperforms single-mechanism distillation!");
  } else if (avgRatchet === avgStrict) {
    console.log("  → Tied — compound memory matches distillation.");
  } else {
    console.log("  → Compound memory didn't outperform on this test set.");
  }

  console.log(`\n  ${tracker.summary()}`);
}

main().catch(console.error);
