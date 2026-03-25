import type { ModelAdapter } from "./types.js";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Token usage and cost tracking for LLM calls.
 */
export interface UsageRecord {
  timestamp: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;         // USD
  durationMs: number;
}

/**
 * Price tracker — accumulates cost across all LLM calls.
 */
export class CostTracker {
  private records: UsageRecord[] = [];

  // Pricing per 1M tokens (input/output) — update as needed
  private pricing: Record<string, { input: number; output: number }> = {
    "google/gemini-3-flash-preview": { input: 0.15, output: 0.60 },
    "google/gemini-2.5-flash-image": { input: 0.15, output: 0.60 },
    "google/gemini-3-pro-image-preview": { input: 1.25, output: 5.00 },
    "openai/gpt-4o-mini": { input: 0.15, output: 0.60 },
    "openai/gpt-4o": { input: 2.50, output: 10.00 },
    "anthropic/claude-sonnet-4": { input: 3.00, output: 15.00 },
  };

  record(model: string, promptTokens: number, completionTokens: number, durationMs: number): UsageRecord {
    const prices = this.pricing[model] ?? { input: 1.0, output: 3.0 }; // fallback
    const cost = (promptTokens * prices.input + completionTokens * prices.output) / 1_000_000;

    const rec: UsageRecord = {
      timestamp: Date.now(),
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost,
      durationMs,
    };
    this.records.push(rec);
    return rec;
  }

  get totalCost(): number {
    return this.records.reduce((s, r) => s + r.cost, 0);
  }

  get totalTokens(): number {
    return this.records.reduce((s, r) => s + r.totalTokens, 0);
  }

  get callCount(): number {
    return this.records.length;
  }

  get avgLatency(): number {
    if (this.records.length === 0) return 0;
    return this.records.reduce((s, r) => s + r.durationMs, 0) / this.records.length;
  }

  /** Summary string for display */
  summary(): string {
    return [
      `Calls: ${this.callCount}`,
      `Tokens: ${this.totalTokens.toLocaleString()} (${this.records.reduce((s, r) => s + r.promptTokens, 0).toLocaleString()} in / ${this.records.reduce((s, r) => s + r.completionTokens, 0).toLocaleString()} out)`,
      `Cost: $${this.totalCost.toFixed(4)}`,
      `Avg latency: ${(this.avgLatency / 1000).toFixed(1)}s`,
    ].join(" | ");
  }

  /** Per-framework breakdown */
  breakdownByTimeRange(startMs: number, endMs: number): { calls: number; tokens: number; cost: number } {
    const subset = this.records.filter(r => r.timestamp >= startMs && r.timestamp <= endMs);
    return {
      calls: subset.length,
      tokens: subset.reduce((s, r) => s + r.totalTokens, 0),
      cost: subset.reduce((s, r) => s + r.cost, 0),
    };
  }

  reset(): void {
    this.records = [];
  }

  getAll(): UsageRecord[] {
    return [...this.records];
  }
}

// Global singleton tracker
export const globalTracker = new CostTracker();

/**
 * Real LLM adapter via OpenRouter API.
 * Supports proxy for region-restricted models.
 * Automatically tracks token usage and cost.
 */
export class LLMModel implements ModelAdapter {
  readonly tracker: CostTracker;

  constructor(
    private apiKey: string,
    private model: string = "google/gemini-3-flash-preview",
    private baseUrl: string = "https://openrouter.ai/api/v1",
    private proxy?: string,
    tracker?: CostTracker,
  ) {
    this.tracker = tracker ?? globalTracker;
  }

  async generate(prompt: string): Promise<string> {
    const start = Date.now();

    const body = JSON.stringify({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.7,
    });

    const tmpFile = join(tmpdir(), `dcas_evolve_${Date.now()}.json`);
    writeFileSync(tmpFile, body);

    try {
      const proxyArg = this.proxy ? `-x ${this.proxy}` : "";
      const curlCmd =
        `curl -s --connect-timeout 15 --max-time 45 --retry 2 --retry-delay 3 ` +
        `${proxyArg} "${this.baseUrl}/chat/completions" ` +
        `-H "Authorization: Bearer ${this.apiKey}" ` +
        `-H "Content-Type: application/json" ` +
        `-d @${tmpFile.replace(/\\/g, "/")}`;
      const result = execSync(curlCmd, { maxBuffer: 10 * 1024 * 1024, timeout: 120000 });

      const data = JSON.parse(result.toString());
      if (data.error) throw new Error(`LLM API: ${data.error.message}`);

      // Track usage
      const usage = data.usage;
      if (usage) {
        this.tracker.record(
          data.model ?? this.model,
          usage.prompt_tokens ?? 0,
          usage.completion_tokens ?? 0,
          Date.now() - start,
        );
      } else {
        // Estimate tokens if usage not returned
        const contentLen = JSON.stringify(data.choices?.[0]?.message?.content ?? "").length;
        this.tracker.record(this.model, Math.ceil(prompt.length / 4), Math.ceil(contentLen / 4), Date.now() - start);
      }

      const content = data.choices?.[0]?.message?.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) return content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("");
      return String(content ?? "");
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  }
}
