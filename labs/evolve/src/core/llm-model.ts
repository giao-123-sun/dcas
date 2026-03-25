import type { ModelAdapter } from "./types.js";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Real LLM adapter via OpenRouter API.
 * Supports proxy for region-restricted models.
 */
export class LLMModel implements ModelAdapter {
  constructor(
    private apiKey: string,
    private model: string = "google/gemini-3-flash-preview",
    private baseUrl: string = "https://openrouter.ai/api/v1",
    private proxy?: string,
  ) {}

  async generate(prompt: string): Promise<string> {
    const body = JSON.stringify({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.7,
    });

    // Write body to temp file to avoid shell escaping issues
    const tmpFile = join(tmpdir(), `dcas_evolve_${Date.now()}.json`);
    writeFileSync(tmpFile, body);

    try {
      const proxyArg = this.proxy ? `-x ${this.proxy}` : "";
      const result = execSync(
        `curl -s ${proxyArg} "${this.baseUrl}/chat/completions" ` +
        `-H "Authorization: Bearer ${this.apiKey}" ` +
        `-H "Content-Type: application/json" ` +
        `-d @${tmpFile.replace(/\\/g, "/")}`,
        { maxBuffer: 10 * 1024 * 1024, timeout: 60000 },
      );

      const data = JSON.parse(result.toString());
      if (data.error) throw new Error(`LLM API: ${data.error.message}`);

      const content = data.choices?.[0]?.message?.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) return content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("");
      return String(content ?? "");
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  }
}
