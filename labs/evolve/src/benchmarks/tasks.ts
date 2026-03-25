import type { Task } from "../core/types.js";

export const mathTasks: Task[] = [
  { id: "math_01", description: "Addition", input: "What is 15 + 27?", expectedAnswer: "42", domain: "math" },
  { id: "math_02", description: "Multiplication", input: "What is 13 * 7?", expectedAnswer: "91", domain: "math" },
  { id: "math_03", description: "Word problem", input: "A store sells apples for $3 each. If you buy 5 apples and pay with $20, how much change?", expectedAnswer: "5", domain: "math" },
  { id: "math_04", description: "Percentage", input: "What is 15% of 200?", expectedAnswer: "30", domain: "math" },
  { id: "math_05", description: "Sequence", input: "Next number: 2, 6, 18, 54, ?", expectedAnswer: "162", domain: "math" },
];

export const reasoningTasks: Task[] = [
  { id: "reason_01", description: "Syllogism", input: "All roses are flowers. Some flowers fade quickly. Can we conclude some roses fade quickly?", expectedAnswer: "no", domain: "reasoning" },
  { id: "reason_02", description: "Transitive", input: "Alice is taller than Bob. Bob is taller than Charlie. Is Alice taller than Charlie? Answer yes or no.", expectedAnswer: "yes", domain: "reasoning" },
];

export const creativeTasks: Task[] = [
  { id: "creative_01", description: "Slogan", input: "Write a catchy slogan for a coffee shop called 'Morning Spark'", domain: "creative" },
];

export const allTasks: Task[] = [...mathTasks, ...reasoningTasks, ...creativeTasks];
