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
