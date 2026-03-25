/**
 * Run benchmarks with a real LLM.
 * Usage: OPENROUTER_API_KEY=xxx pnpm bench
 */
import { LLMModel } from "./core/llm-model.js";
import { ContainsEvaluator } from "./core/evaluator.js";
import { mathTasks } from "./benchmarks/tasks.js";
import { ralphLoop } from "./frameworks/01-ralph-loop.js";
import { selfCritique } from "./frameworks/03-self-critique.js";
import { experienceDistill } from "./frameworks/04-experience-distill.js";
import { twinAdversarial } from "./frameworks/06-twin-adversarial.js";
import { tournamentEvolution } from "./frameworks/07-tournament.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("Set OPENROUTER_API_KEY"); process.exit(1); }

const proxy = process.env.LLM_PROXY || "http://127.0.0.1:7890";
const model = new LLMModel(apiKey, "google/gemini-3-flash-preview", undefined, proxy);
const evaluator = new ContainsEvaluator();
const task = mathTasks[2]; // Word problem

async function main() {
  console.log(`\nBenchmark: "${task.input}" (expected: ${task.expectedAnswer})\n`);

  console.log("=== Ralph Loop ===");
  const r1 = await ralphLoop(task, model, evaluator, { maxRounds: 3 });
  console.log(`Best: "${r1.bestSolution.content}" | Score: ${r1.bestSolution.score} | Rounds: ${r1.rounds} | ${r1.durationMs}ms`);

  console.log("\n=== Self-Critique ===");
  const r2 = await selfCritique(task, model, evaluator, { maxRounds: 3 });
  console.log(`Best: "${r2.bestSolution.content}" | Score: ${r2.bestSolution.score} | Rounds: ${r2.rounds} | ${r2.durationMs}ms`);

  console.log("\n=== Experience Distill ===");
  const r3 = await experienceDistill([task], model, evaluator, { maxRounds: 2 });
  const last3 = r3[r3.length - 1];
  console.log(`Best: "${last3.bestSolution.content}" | Score: ${last3.bestSolution.score} | Experiences: ${last3.experiences.length} | ${last3.durationMs}ms`);

  console.log("\n=== Twin Adversarial ===");
  const r4 = await twinAdversarial(task, model, evaluator, { maxRounds: 2 });
  console.log(`Best: "${r4.bestSolution.content}" | Score: ${r4.bestSolution.score} | Experiences: ${r4.experiences.length} | ${r4.durationMs}ms`);

  console.log("\n=== Tournament ===");
  const r5 = await tournamentEvolution(task, model, evaluator, { maxRounds: 2, populationSize: 3, historyPoolSize: 2 });
  console.log(`Best: "${r5.bestSolution.content}" | Score: ${r5.bestSolution.score} | Experiences: ${r5.experiences.length} | ${r5.durationMs}ms`);

  console.log("\n=== Summary ===");
  console.log(`Ralph Loop:    ${r1.bestSolution.score?.toFixed(2)} in ${r1.rounds} rounds`);
  console.log(`Self-Critique: ${r2.bestSolution.score?.toFixed(2)} in ${r2.rounds} rounds`);
  console.log(`Exp Distill:   ${last3.bestSolution.score?.toFixed(2)} in ${last3.rounds} rounds`);
  console.log(`Twin Adv:      ${r4.bestSolution.score?.toFixed(2)} in ${r4.rounds} rounds`);
  console.log(`Tournament:    ${r5.bestSolution.score?.toFixed(2)} in ${r5.rounds} rounds`);
}

main().catch(console.error);
