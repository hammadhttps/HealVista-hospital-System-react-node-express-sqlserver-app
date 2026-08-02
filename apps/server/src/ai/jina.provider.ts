import { z, type ZodTypeAny } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import type { AIProvider, AiUsage, GenerationImage } from "./ai.provider.js";

/**
 * The Jina implementation of `AIProvider`.
 *
 * This is the **only** file that talks to `api.jina.ai`. Everything above the
 * interface stays SDK-free and therefore provider-agnostic.
 *
 * - Embeddings use `jina-embeddings-v5-text-small` (1024-dim, within the
 *   pgvector HNSW 2000-dim ceiling). `task: "retrieval.query"` and
 *   `normalized: true` keep stored and queried vectors comparable.
 * - Generation uses `jina-vlm`. Jina rejects a `system` role (conversation
 *   roles must alternate), so the system prompt is merged into the user turn.
 *   `response_format: json_object` is set, and any markdown code fence the
 *   model wraps its JSON in is stripped before `JSON.parse`.
 * - The provider is created lazily and only when configured — a missing key
 *   leaves every AI feature on its non-AI fallback instead of crashing at boot.
 */

const JINA_BASE = "https://api.jina.ai/v1";

function getApiKey(): string {
  if (!env.JINA_API_KEY) {
    throw new AppError("The AI provider is not configured on this server", 503);
  }
  return env.JINA_API_KEY;
}

/** Renders a Zod schema as a compact JSON-shape hint embedded in the prompt. */
function zodShapeHint(schema: ZodTypeAny): unknown {
  if (schema instanceof z.ZodObject) {
    const shape = (schema as unknown as { shape: Record<string, ZodTypeAny> }).shape;
    const out: Record<string, unknown> = {};
    for (const [key, fieldSchema] of Object.entries(shape)) {
      out[key] = zodShapeHint(fieldSchema);
    }
    return { type: "object", properties: out };
  }
  if (schema instanceof z.ZodArray) {
    const element = (schema._def as unknown as { element: ZodTypeAny }).element;
    return { type: "array", items: zodShapeHint(element) };
  }
  if (schema instanceof z.ZodEnum) {
    const entries = (schema._def as unknown as { entries: Record<string, string> }).entries;
    return { type: "string", enum: Object.values(entries) };
  }
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodLiteral)
    return { type: typeof (schema._def as { value?: unknown }).value };
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault
  ) {
    const inner = (schema._def as unknown as { innerType: ZodTypeAny }).innerType;
    return zodShapeHint(inner);
  }
  return { type: "any" };
}

export { zodShapeHint };

/** Strips a ```json / ```python fence if the model wrapped the payload in one. */
function unwrapJson(content: string): string {
  const trimmed = content.trim();
  const fence = /^```[a-zA-Z]*\s*\n?([\s\S]*?)(?:\n)?```\s*$/;
  const match = trimmed.match(fence);
  return match ? match[1].trim() : trimmed;
}

class JinaProvider implements AIProvider {
  private latencyMs?: number;
  private tokensUsed?: number;

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(`${JINA_BASE}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
          model: env.JINA_EMBED_MODEL,
          task: "retrieval.query",
          normalized: true,
          input: texts,
        }),
      });
    } catch (err) {
      throw toAppError(err);
    }
    this.latencyMs = Date.now() - start;

    if (!res.ok) throw await toHttpError(res);
    const data = (await res.json()) as { data?: { embedding: number[] }[] };
    const values = data.data?.map((d) => d.embedding) ?? [];
    if (values.length !== texts.length) {
      throw new AppError("Embedding provider returned an unexpected shape", 502);
    }
    return values;
  }

  async generate<T>(opts: {
    prompt: string;
    schema: z.ZodType<T>;
    system?: string;
    maxTokens?: number;
    images?: GenerationImage[];
  }): Promise<T> {
    const start = Date.now();

    const systemText = opts.system
      ? `${opts.system}\n\nYou must return ONLY a JSON object, no prose, no code fences.`
      : "You must return ONLY a JSON object, no prose, no code fences.";
    const shapeHint = JSON.stringify(zodShapeHint(opts.schema));

    const textPrompt = `${systemText}\n\nExpected JSON shape (follow it exactly):\n${shapeHint}\n\n${opts.prompt}`;

    let content: unknown;
    if (opts.images && opts.images.length > 0) {
      content = [
        { type: "text", text: textPrompt },
        ...opts.images.map((img) => ({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        })),
      ];
    } else {
      content = textPrompt;
    }

    let res: Response;
    try {
      res = await fetch(`${JINA_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
          model: env.JINA_CHAT_MODEL,
          messages: [{ role: "user", content }],
          response_format: { type: "json_object" },
          max_tokens: opts.maxTokens ?? 1024,
        }),
      });
    } catch (err) {
      throw toAppError(err);
    }
    this.latencyMs = Date.now() - start;

    if (!res.ok) throw await toHttpError(res);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    this.tokensUsed = (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0);

    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new AppError("The AI provider declined to generate a response", 422);
    }

    try {
      return JSON.parse(unwrapJson(text)) as T;
    } catch {
      throw new AppError("The AI provider returned unparseable output", 502);
    }
  }

  lastUsage(): AiUsage {
    return { latencyMs: this.latencyMs, tokensUsed: this.tokensUsed };
  }
}

function toAppError(err: unknown): AppError {
  const message =
    err instanceof Error && err.message ? err.message.slice(0, 300) : "AI provider request failed";
  if (/rate limit|429|quota/i.test(message)) {
    return new AppError("The AI service is rate-limited right now", 429);
  }
  return new AppError(message || "AI provider request failed", 502);
}

async function toHttpError(res: Response): Promise<AppError> {
  let message = `AI provider request failed with status ${res.status}`;
  try {
    const body = (await res.json()) as {
      detail?: { message?: string } | string;
      message?: string;
    };
    const raw = typeof body?.detail === "string" ? body.detail : body?.detail?.message;
    if (raw) message = raw.slice(0, 300);
    else if (body?.message) message = body.message.slice(0, 300);
  } catch {
    // body wasn't JSON; keep the status-based message
  }
  if (/rate limit|429|quota/i.test(message)) {
    return new AppError("The AI service is rate-limited right now", 429);
  }
  return new AppError(message, 502);
}

export const jinaProvider: AIProvider = new JinaProvider();
