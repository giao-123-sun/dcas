import type { ModelAdapter } from "./types.js";

export class MockModel implements ModelAdapter {
  private callCount = 0;

  async generate(prompt: string): Promise<string> {
    this.callCount++;
    const match = prompt.match(/(\d+)\s*([+\-*/])\s*(\d+)/);
    if (match) {
      const [, a, op, b] = match;
      const na = parseInt(a), nb = parseInt(b);
      switch (op) {
        case "+": return String(na + nb);
        case "-": return String(na - nb);
        case "*": return String(na * nb);
        case "/": return nb !== 0 ? String(Math.round(na / nb)) : "undefined";
      }
    }
    if (prompt.includes("critique") || prompt.includes("review") || prompt.includes("improve")) {
      return "The answer should be more precise. Double-check the arithmetic.";
    }
    if (prompt.includes("experience") || prompt.includes("lesson") || prompt.includes("rule") || prompt.includes("principle")) {
      return "Always verify calculations step by step before giving a final answer.";
    }
    if (prompt.includes("pattern") || prompt.includes("distinguishes")) {
      return "Good answers are precise and directly address the question without unnecessary elaboration.";
    }
    return `Response ${this.callCount}`;
  }
}
