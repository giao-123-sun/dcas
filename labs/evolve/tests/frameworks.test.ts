import { describe, it, expect } from "vitest";
import { MockModel } from "../src/core/mock-model.js";
import { ExactMatchEvaluator, ContainsEvaluator } from "../src/core/evaluator.js";
import { ExperienceStore } from "../src/core/store.js";
import { mathTasks } from "../src/benchmarks/tasks.js";
import { ralphLoop } from "../src/frameworks/01-ralph-loop.js";
import { selfCritique } from "../src/frameworks/03-self-critique.js";
import { experienceDistill } from "../src/frameworks/04-experience-distill.js";
import { twinAdversarial } from "../src/frameworks/06-twin-adversarial.js";
import { tournamentEvolution } from "../src/frameworks/07-tournament.js";
import type { Task } from "../src/core/types.js";
import { ReflectionMemory } from "../src/core/reflection-memory.js";
import { StrategyLibrary } from "../src/core/strategy-library.js";
import { reflexionRatchet } from "../src/frameworks/11-reflexion-ratchet.js";

const model = new MockModel();
const exact = new ExactMatchEvaluator();
const contains = new ContainsEvaluator();
const addTask: Task = { id: "t1", description: "Add", input: "What is 15 + 27?", expectedAnswer: "42", domain: "math" };

describe("ExperienceStore", () => {
  it("should add and retrieve", () => {
    const s = new ExperienceStore();
    s.add("Check work", "success");
    s.add("Break steps", "failure");
    expect(s.count).toBe(2);
  });
  it("should reinforce duplicates", () => {
    const s = new ExperienceStore();
    s.add("Rule", "success"); s.add("Rule", "success");
    expect(s.count).toBe(1);
    expect(s.getAll()[0].supportCount).toBe(2);
  });
  it("should format prompt", () => {
    const s = new ExperienceStore();
    s.add("Rule one", "success");
    expect(s.toPromptString()).toContain("Rule one");
  });
});

describe("Evaluators", () => {
  it("exact match 1.0", async () => { expect(await exact.evaluate(addTask, { taskId: "t", content: "42", round: 0 })).toBe(1.0); });
  it("exact match 0.0", async () => { expect(await exact.evaluate(addTask, { taskId: "t", content: "43", round: 0 })).toBe(0.0); });
  it("contains partial", async () => { expect(await contains.evaluate(addTask, { taskId: "t", content: "The answer is 42", round: 0 })).toBeGreaterThan(0.5); });
  it("contains numeric close", async () => { expect(await contains.evaluate(addTask, { taskId: "t", content: "42.0", round: 0 })).toBeGreaterThan(0.9); });
});

describe("Ralph Loop", () => {
  it("should produce result with score history", async () => {
    const r = await ralphLoop(addTask, model, contains, { maxRounds: 3 });
    expect(r.framework).toBe("ralph_loop");
    expect(r.scoreHistory.length).toBeGreaterThan(0);
    expect(r.bestSolution).toBeDefined();
    expect(r.bestSolution.score).toBe(1.0); // MockModel can solve 15+27
  });
  it("should stop early on target", async () => {
    const r = await ralphLoop(addTask, model, exact, { maxRounds: 10, targetScore: 1.0 });
    expect(r.rounds).toBe(1); // Solved first try
  });
});

describe("Self-Critique", () => {
  it("should iterate", async () => {
    const r = await selfCritique(addTask, model, contains, { maxRounds: 3 });
    expect(r.framework).toBe("self_critique");
    expect(r.bestSolution.score).toBeGreaterThanOrEqual(0);
  });
});

describe("Experience Distillation", () => {
  it("should accumulate experiences", async () => {
    const results = await experienceDistill(mathTasks.slice(0, 2), model, contains, { maxRounds: 2 });
    expect(results.length).toBe(4);
  });
});

describe("Twin Adversarial", () => {
  it("should compete and learn", async () => {
    const r = await twinAdversarial(addTask, model, contains, { maxRounds: 2 });
    expect(r.framework).toBe("twin_adversarial");
    expect(r.experiences.length).toBeGreaterThan(0);
  });
});

describe("Tournament Evolution", () => {
  it("should run tournament", async () => {
    const r = await tournamentEvolution(addTask, model, contains, { maxRounds: 2, populationSize: 3, historyPoolSize: 2 });
    expect(r.framework).toBe("tournament_evolution");
    expect(r.experiences.length).toBeGreaterThan(0);
  });
});

describe("ReflectionMemory", () => {
  it("should store and retrieve reflections", () => {
    const mem = new ReflectionMemory();
    mem.add({
      taskId: "t1",
      taskDescription: "What is the capital of France?",
      prediction: "London",
      actual: "Paris",
      wasCorrect: false,
      reflection: "Check geographical facts carefully.",
    });
    expect(mem.count).toBe(1);

    const task = { id: "t2", description: "", input: "What is the capital of Germany?", domain: "reasoning" as const };
    const results = mem.retrieve(task);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].reflection).toContain("geographical");
  });

  it("should format for prompt", () => {
    const mem = new ReflectionMemory();
    mem.add({
      taskId: "t1", taskDescription: "math problem about addition",
      prediction: "5", actual: "7", wasCorrect: false,
      reflection: "Double-check arithmetic.",
    });
    const task = { id: "t2", description: "", input: "another math problem about addition", domain: "math" as const };
    const prompt = mem.toPromptString(task);
    expect(prompt).toContain("Double-check");
    expect(prompt).toContain("Past experiences");
  });
});

describe("StrategyLibrary", () => {
  it("should store and retrieve strategies", () => {
    const lib = new StrategyLibrary();
    lib.store("math problem", "test", "Break into steps", 0.9);
    lib.store("logic puzzle", "test", "Use elimination", 0.8);
    expect(lib.count).toBe(2);

    const results = lib.retrieve("math problem with steps");
    expect(results.length).toBeGreaterThan(0);
  });

  it("should deduplicate and update uses", () => {
    const lib = new StrategyLibrary();
    lib.store("task", "fw", "Same strategy", 0.7);
    lib.store("task", "fw", "Same strategy", 0.9);
    expect(lib.count).toBe(1);
    expect(lib.getTop(1)[0].uses).toBe(2);
    expect(lib.getTop(1)[0].score).toBe(0.9);
  });
});

describe("Reflexion Ratchet", () => {
  it("should run and accumulate reflections", async () => {
    const results = await reflexionRatchet(
      [addTask],
      model,
      contains,
      { maxRounds: 2 },
    );
    expect(results.length).toBe(2); // 1 task × 2 rounds
    expect(results[0].framework).toBe("reflexion_ratchet");
  });

  it("should maintain ratchet (never regress)", async () => {
    const refMem = new ReflectionMemory();
    const stratLib = new StrategyLibrary();

    const results = await reflexionRatchet(
      [addTask],
      model,
      contains,
      { maxRounds: 3 },
      refMem,
      stratLib,
    );

    // Best solution should be monotonically non-decreasing
    let maxSoFar = 0;
    for (const r of results) {
      const score = r.bestSolution.score ?? 0;
      expect(score).toBeGreaterThanOrEqual(maxSoFar);
      maxSoFar = Math.max(maxSoFar, score);
    }

    // Should have accumulated reflections
    expect(refMem.count).toBeGreaterThan(0);
  });
});
