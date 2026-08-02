import type { z } from "zod";

export interface GenerationImage {
  /** MIME type of the image, e.g. `image/png` or `image/jpeg`. */
  mimeType: string;
  /** Base64-encoded bytes. Sent inline — never a URL, so nothing leaks to logs. */
  data: string;
}

/**
 * The single way any module talks to an LLM.
 *
 * Nothing in the services layer may import a provider SDK (or any other SDK).
 * Swapping Jina for OpenAI — a config change — must not mean touching a single
 * feature file. Tests mock this interface instead of a network dependency.
 */
export interface AIProvider {
  /** 1024-dim vectors for the pgvector store. Accepts an array; one call per document. */
  embed(texts: string[]): Promise<number[][]>;

  /**
   * Structured generation. The `schema` is passed to the model as its
   * `responseSchema` (a hint that shapes the JSON), but the returned object is
   * **always Zod-parsed** — a hint is not a guarantee, and a malformed payload
   * must never reach the UI. Callers use `generateValidated` in guardrails.ts,
   * which retries once and then throws a typed error.
   *
   * `images` are the vision path (OCR of photographed reports): inline base64
   * images placed ahead of the text prompt. Providers that cannot accept images
   * should throw; callers gate on `isAiConfigured()` for the fallback.
   */
  generate<T>(opts: {
    prompt: string;
    schema: z.ZodType<T>;
    system?: string;
    maxTokens?: number;
    images?: GenerationImage[];
  }): Promise<T>;

  /** Latency + token usage, for the `AiInteraction` log. */
  lastUsage(): { latencyMs?: number; tokensUsed?: number };
}

export interface AiUsage {
  latencyMs?: number;
  tokensUsed?: number;
}
