export interface Task {
  id: string;
  description: string;
  input: string;
  expectedAnswer?: string;
  domain: "math" | "code" | "reasoning" | "creative";
}

export interface Solution {
  taskId: string;
  content: string;
  score?: number;
  round: number;
  meta?: Record<string, unknown>;
}

export interface Experience {
  id: string;
  rule: string;
  supportCount: number;
  confidence: number;
  source: "success" | "failure" | "comparison" | "self_critique";
}

export interface ModelAdapter {
  generate(prompt: string): Promise<string>;
}

export interface Evaluator {
  evaluate(task: Task, solution: Solution): Promise<number>;
}

export interface FrameworkConfig {
  maxRounds: number;
  targetScore?: number;
  verbose?: boolean;
}

export interface FrameworkResult {
  framework: string;
  taskId: string;
  bestSolution: Solution;
  rounds: number;
  scoreHistory: number[];
  experiences: Experience[];
  durationMs: number;
}
