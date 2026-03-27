export type { Task, Solution, Experience, ModelAdapter, Evaluator, FrameworkConfig, FrameworkResult } from "./core/types.js";
export { ExperienceStore } from "./core/store.js";
export { MockModel } from "./core/mock-model.js";
export { LLMModel, CostTracker, globalTracker } from "./core/llm-model.js";
export type { UsageRecord } from "./core/llm-model.js";
export { ExactMatchEvaluator, ContainsEvaluator } from "./core/evaluator.js";
export { mathTasks, reasoningTasks, creativeTasks, hleTasks, hleRound2Tasks, allTasks } from "./benchmarks/tasks.js";

// Original frameworks
export { ralphLoop } from "./frameworks/01-ralph-loop.js";
export { selfCritique } from "./frameworks/03-self-critique.js";
export { experienceDistill } from "./frameworks/04-experience-distill.js";
export { adversarialDistill } from "./frameworks/05-adversarial-distill.js";
export { twinAdversarial } from "./frameworks/06-twin-adversarial.js";
export { tournamentEvolution } from "./frameworks/07-tournament.js";

// Improved frameworks (v2)
export { critiqueLock } from "./frameworks/09-critique-lock.js";
export { evolveAnchor } from "./frameworks/10-evolve-anchor.js";

// Agent-pattern frameworks (v3)
export { ReflectionMemory } from "./core/reflection-memory.js";
export type { Reflection } from "./core/reflection-memory.js";
export { StrategyLibrary } from "./core/strategy-library.js";
export type { StrategyEntry as LibraryStrategyEntry } from "./core/strategy-library.js";
export { reflexionRatchet } from "./frameworks/11-reflexion-ratchet.js";
