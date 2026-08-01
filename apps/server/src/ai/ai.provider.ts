import type { z } from "zod";

/**
 * The single way any module talks to an LLM.
 *
 * Nothing in the services layer may import `@google/genai` (or any other SDK).
 * Swapping Gemini for OpenAI — a config change, per the roadmap — must not mean
 * touching a single feature file. Tests mock this interface instead of a network
 * dependency.
 */
export interface AIProvider {
  /** 768-dim vectors for the pgvector store. Accepts an array; one call per document. */
  embed(texts: string[]): Promise<number[][]>;

  /**
   * Structured generation. The `schema` is passed to the model as its
   * `responseSchema` (a hint that shapes the JSON), but the returned object is
   * **always Zod-parsed** — a hint is not a guarantee, and a malformed payload
   * must never reach the UI. Callers use `generateValidated` in guardrails.ts,
   * which retries once and then throws a typed error.
   */
  generate<T>(opts: {
    prompt: string;
    schema: z.ZodType<T>;
    system?: string;
    maxTokens?: number;
  }): Promise<T>;

  /** Latency + token usage, for the `AiInteraction` log. */
  lastUsage(): { latencyMs?: number; tokensUsed?: number };
}

export interface AiUsage {
  latencyMs?: number;
  tokensUsed?: number;
}
