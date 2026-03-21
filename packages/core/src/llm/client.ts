// ============================================================
// DCAS LLM Client — OpenRouter / Gemini integration
// ============================================================

export interface LLMConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  proxy?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

const DEFAULT_CONFIG: Partial<LLMConfig> = {
  baseUrl: "https://openrouter.ai/api/v1",
  model: "google/gemini-3-flash-preview",
  maxTokens: 4096,
  temperature: 0.3,
};

/**
 * Lightweight LLM client for OpenRouter-compatible APIs.
 * Supports proxy for region-restricted models.
 */
export class LLMClient {
  private config: Required<Pick<LLMConfig, "apiKey" | "model" | "baseUrl" | "maxTokens" | "temperature">> & { proxy?: string };

  constructor(config: LLMConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? DEFAULT_CONFIG.model!,
      baseUrl: config.baseUrl ?? DEFAULT_CONFIG.baseUrl!,
      maxTokens: config.maxTokens ?? DEFAULT_CONFIG.maxTokens!,
      temperature: config.temperature ?? DEFAULT_CONFIG.temperature!,
      proxy: config.proxy,
    };
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const body = {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    const response = await this.fetchWithProxy(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`LLM API error ${response.status}: ${err}`);
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error("No choices in LLM response");
    }

    const content = typeof choice.message?.content === "string"
      ? choice.message.content
      : Array.isArray(choice.message?.content)
        ? choice.message.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("")
        : "";

    return {
      content,
      model: data.model ?? this.config.model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
      } : undefined,
    };
  }

  /**
   * Chat with structured JSON output.
   * Adds a system instruction to output valid JSON and attempts to parse.
   */
  async chatJSON<T = unknown>(messages: LLMMessage[], retries = 1): Promise<T> {
    const augmented: LLMMessage[] = [
      {
        role: "system",
        content: "You must respond with valid JSON only. No markdown, no explanation, no code fences. Just the JSON object.",
      },
      ...messages,
    ];

    for (let attempt = 0; attempt <= retries; attempt++) {
      const response = await this.chat(augmented);
      try {
        // Strip potential markdown code fences
        const cleaned = response.content
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```\s*$/, "")
          .trim();
        return JSON.parse(cleaned) as T;
      } catch {
        if (attempt === retries) {
          throw new Error(`Failed to parse LLM JSON after ${retries + 1} attempts. Last response: ${response.content.slice(0, 200)}`);
        }
      }
    }
    throw new Error("Unreachable");
  }

  private async fetchWithProxy(url: string, init: RequestInit): Promise<Response> {
    // Native fetch — proxy handled via environment or agent
    // For Node.js with proxy, users should set HTTPS_PROXY env or use a global agent
    // In production, integrate with undici ProxyAgent
    return fetch(url, init);
  }
}

/**
 * Create a pre-configured client from environment variables.
 *
 * Expects:
 *   OPENROUTER_API_KEY — required
 *   LLM_MODEL — optional, defaults to gemini-3-flash-preview
 *   LLM_PROXY — optional
 */
export function createLLMClientFromEnv(): LLMClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is required");
  }
  return new LLMClient({
    apiKey,
    model: process.env.LLM_MODEL ?? "google/gemini-3-flash-preview",
    proxy: process.env.LLM_PROXY,
  });
}
