/**
 * Run benchmarks with a real LLM + cost tracking + score evolution curves.
 * Usage: OPENROUTER_API_KEY=xxx pnpm bench
 */
import { LLMModel, CostTracker } from "./core/llm-model.js";
import { ContainsEvaluator } from "./core/evaluator.js";
import { mathTasks, reasoningTasks, hleTasks } from "./benchmarks/tasks.js";
import { ralphLoop } from "./frameworks/01-ralph-loop.js";
import { selfCritique } from "./frameworks/03-self-critique.js";
import { experienceDistill } from "./frameworks/04-experience-distill.js";
import { twinAdversarial } from "./frameworks/06-twin-adversarial.js";
import { tournamentEvolution } from "./frameworks/07-tournament.js";
import type { Task, FrameworkResult } from "./core/types.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("Set OPENROUTER_API_KEY"); process.exit(1); }

const proxy = process.env.LLM_PROXY || "http://127.0.0.1:7890";
const tracker = new CostTracker();
const model = new LLMModel(apiKey, "google/gemini-3-flash-preview", undefined, proxy, tracker);
const evaluator = new ContainsEvaluator();

// Mix of easy + hard (HLE) tasks
const tasks: Task[] = [
  mathTasks[2],       // Easy: word problem
  hleTasks[0],        // Hard: HLE philosophy
  hleTasks[2],        // Hard: HLE activation functions
  hleTasks[3],        // Hard: HLE physics (Kaluza-Klein)
];

/** Draw an ASCII score curve */
function drawCurve(history: number[], width = 30): string {
  if (history.length === 0) return "  (no data)";
  const blocks = ["░", "▒", "▓", "█"];
  return history.map((s, i) => {
    const barLen = Math.round(s * 10);
    const bar = "█".repeat(barLen) + "░".repeat(10 - barLen);
    return `    R${i + 1}: ${bar} ${s.toFixed(2)}`;
  }).join("\n");
}

/** Track cost for a single framework run */
async function runWithTracking(
  name: string,
  fn: () => Promise<FrameworkResult | FrameworkResult[]>,
): Promise<{ name: string; results: FrameworkResult[]; calls: number; tokens: number; cost: number; timeMs: number }> {
  const sc = tracker.callCount, st = tracker.totalTokens, sco = tracker.totalCost;
  const start = Date.now();
  const raw = await fn();
  const results = Array.isArray(raw) ? raw : [raw];
  return {
    name,
    results,
    calls: tracker.callCount - sc,
    tokens: tracker.totalTokens - st,
    cost: tracker.totalCost - sco,
    timeMs: Date.now() - start,
  };
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║    @dcas/evolve — Meta-Learning Benchmark        ║");
  console.log("║    Model: google/gemini-3-flash-preview           ║");
  console.log("╚══════════════════════════════════════════════════╝");

  const summary: Array<{ fw: string; task: string; first: number; last: number; best: number; rounds: number; calls: number; cost: number; history: number[] }> = [];

  for (const task of tasks) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Task: ${task.id} — "${task.input}"`);
    console.log(`Expected: ${task.expectedAnswer ?? "(creative)"}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const frameworks = [
      { name: "Ralph Loop", fn: () => ralphLoop(task, model, evaluator, { maxRounds: 4 }) },
      { name: "Self-Critique", fn: () => selfCritique(task, model, evaluator, { maxRounds: 4 }) },
      { name: "Exp Distill", fn: () => experienceDistill([task], model, evaluator, { maxRounds: 3 }) },
      { name: "Twin Adv", fn: () => twinAdversarial(task, model, evaluator, { maxRounds: 3 }) },
      { name: "Tournament", fn: () => tournamentEvolution(task, model, evaluator, { maxRounds: 3, populationSize: 3, historyPoolSize: 2 }) },
    ];

    for (const fw of frameworks) {
      const run = await runWithTracking(fw.name, fw.fn);
      // Merge score histories across results
      const allScores = run.results.flatMap(r => r.scoreHistory);
      const first = allScores[0] ?? 0;
      const last = allScores[allScores.length - 1] ?? 0;
      const best = Math.max(...allScores, 0);
      const delta = last - first;
      const deltaStr = delta > 0 ? `+${delta.toFixed(2)}` : delta < 0 ? delta.toFixed(2) : "=0.00";
      const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";

      console.log(`\n  ┌─ ${fw.name} ─────────────────────────────────`);
      console.log(drawCurve(allScores));
      console.log(`  │  First: ${first.toFixed(2)} → Last: ${last.toFixed(2)} (${arrow}${deltaStr}) | Best: ${best.toFixed(2)}`);
      console.log(`  │  Rounds: ${allScores.length} | Calls: ${run.calls} | Tokens: ${run.tokens} | Cost: $${run.cost.toFixed(4)}`);
      console.log(`  └──────────────────────────────────────────────`);

      summary.push({ fw: fw.name, task: task.id, first, last, best, rounds: allScores.length, calls: run.calls, cost: run.cost, history: allScores });
    }
  }

  // Final summary table
  console.log("\n\n══════════════════════════════════════════════════════════════════");
  console.log("                     FINAL LEADERBOARD");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("Framework      │ Avg Best │ Avg Δ  │ Total Calls │ Total Cost");
  console.log("───────────────┼──────────┼────────┼─────────────┼───────────");

  const fws = ["Ralph Loop", "Self-Critique", "Exp Distill", "Twin Adv", "Tournament"];
  for (const fw of fws) {
    const rows = summary.filter(s => s.fw === fw);
    const avgBest = rows.reduce((s, r) => s + r.best, 0) / Math.max(rows.length, 1);
    const avgDelta = rows.reduce((s, r) => s + (r.last - r.first), 0) / Math.max(rows.length, 1);
    const totalCalls = rows.reduce((s, r) => s + r.calls, 0);
    const totalCost = rows.reduce((s, r) => s + r.cost, 0);
    const deltaStr = avgDelta >= 0 ? `+${avgDelta.toFixed(2)}` : avgDelta.toFixed(2);
    console.log(`${fw.padEnd(14)} │   ${avgBest.toFixed(2)}   │ ${deltaStr.padStart(6)} │      ${String(totalCalls).padStart(5)} │ $${totalCost.toFixed(4)}`);
  }

  console.log("───────────────┴──────────┴────────┴─────────────┴───────────");
  console.log(`\n${tracker.summary()}\n`);
}

main().catch(console.error);
