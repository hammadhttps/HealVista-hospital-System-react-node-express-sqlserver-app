import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { z, type ZodTypeAny } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import type { AIProvider, AiUsage } from "./ai.provider.js";

/**
 * The Gemini implementation of `AIProvider`.
 *
 * This is the **only** file that imports `@google/genai`. Everything above the
 * interface stays SDK-free and therefore provider-agnostic.
 *
 * Embeddings use `text-embedding-004` (768-dim); generation uses
 * `env.GEMINI_MODEL`. The provider is created lazily and only when configured —
 * a missing key leaves every AI feature on its non-AI fallback instead of
 * crashing the server at boot.
 */

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (client) return client;
  if (!env.GEMINI_API_KEY) {
    throw new AppError("The AI provider is not configured on this server", 503);
  }
  client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

function innerType(schema: ZodTypeAny): ZodTypeAny {
  return (schema._def as unknown as { innerType: ZodTypeAny }).innerType;
}

function typeOf(schema: ZodTypeAny): Type {
  if (schema instanceof z.ZodObject) return Type.OBJECT;
  if (schema instanceof z.ZodArray) return Type.ARRAY;
  if (schema instanceof z.ZodEnum) return Type.STRING;
  if (schema instanceof z.ZodLiteral) return Type.STRING;
  if (schema instanceof z.ZodString) return Type.STRING;
  if (schema instanceof z.ZodNumber) return Type.NUMBER;
  if (schema instanceof z.ZodBigInt) return Type.INTEGER;
  if (schema instanceof z.ZodBoolean) return Type.BOOLEAN;
  if (schema instanceof z.ZodRecord) return Type.OBJECT;
  if (schema instanceof z.ZodOptional) return typeOf(innerType(schema));
  if (schema instanceof z.ZodNullable) return typeOf(innerType(schema));
  if (schema instanceof z.ZodDefault) return typeOf(innerType(schema));
  throw new Error(
    `[gemini] Unsupported Zod type for responseSchema: ${schema.constructor.name}. ` +
      `Keep AI output schemas to object/string/number/boolean/enum/array.`,
  );
}

function isOptionalLike(schema: ZodTypeAny): boolean {
  return (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault
  );
}

/**
 * Converts a Zod schema into Gemini's `Schema`. Only the shapes this project
 * uses are supported (object / string / number / boolean / enum / array /
 * optional / nullable / literal); anything exotic throws loudly at build time
 * rather than silently weakening validation.
 */
export function zodToGeminiSchema(schema: ZodTypeAny): Schema {
  if (schema instanceof z.ZodObject) {
    const shape = (schema as unknown as { shape: Record<string, ZodTypeAny> }).shape;
    const properties: Record<string, Schema> = {};
    const required: string[] = [];
    for (const [key, fieldSchema] of Object.entries(shape)) {
      properties[key] = zodToGeminiSchema(fieldSchema);
      if (!isOptionalLike(fieldSchema)) required.push(key);
    }
    return { type: Type.OBJECT, properties, required };
  }

  if (schema instanceof z.ZodArray) {
    const element = (schema._def as unknown as { element: ZodTypeAny }).element;
    return { type: Type.ARRAY, items: zodToGeminiSchema(element) };
  }

  if (schema instanceof z.ZodEnum) {
    const entries = (schema._def as unknown as { entries: Record<string, string> }).entries;
    return { type: Type.STRING, format: "enum", enum: Object.values(entries) };
  }

  if (schema instanceof z.ZodLiteral) return { type: Type.STRING };
  if (schema instanceof z.ZodString) return { type: Type.STRING };
  if (schema instanceof z.ZodNumber) return { type: Type.NUMBER };
  if (schema instanceof z.ZodBigInt) return { type: Type.INTEGER };
  if (schema instanceof z.ZodBoolean) return { type: Type.BOOLEAN };
  if (schema instanceof z.ZodRecord) return { type: Type.OBJECT };

  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault
  ) {
    return zodToGeminiSchema(innerType(schema));
  }

  throw new Error(
    `[gemini] Unsupported Zod type for responseSchema: ${schema.constructor.name}. ` +
      `Keep AI output schemas to object/string/number/boolean/enum/array.`,
  );
}

class GeminiProvider implements AIProvider {
  private latencyMs?: number;
  private tokensUsed?: number;

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const start = Date.now();
    const ai = getClient();
    try {
      const response = await ai.models.embedContent({
        model: env.GEMINI_EMBED_MODEL,
        contents: texts,
      });
      this.latencyMs = Date.now() - start;
      const values = response.embeddings?.map((e) => e.values as number[]) ?? [];
      if (values.length !== texts.length) {
        throw new AppError("Embedding provider returned an unexpected shape", 502);
      }
      return values;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw toAppError(err);
    }
  }

  async generate<T>(opts: {
    prompt: string;
    schema: z.ZodType<T>;
    system?: string;
    maxTokens?: number;
  }): Promise<T> {
    const start = Date.now();
    const ai = getClient();
    try {
      const response = await ai.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: zodToGeminiSchema(opts.schema),
          systemInstruction: opts.system ? { parts: [{ text: opts.system }] } : undefined,
          maxOutputTokens: opts.maxTokens ?? 1024,
        },
      });
      this.latencyMs = Date.now() - start;
      this.tokensUsed = response.usageMetadata?.totalTokenCount ?? undefined;

      const text = response.text;
      if (!text) {
        // A safety-blocked generation (violating the content policy) returns no
        // candidates at all. Surface it as a typed error so the caller can fall back.
        throw new AppError("The AI provider declined to generate a response", 422);
      }

      return JSON.parse(text) as T;
    } catch (err) {
      if (err instanceof SyntaxError) {
        // Malformed JSON from the model — the caller's retry/fallback handles it.
        throw new AppError("The AI provider returned unparseable output", 502);
      }
      if (err instanceof AppError) throw err;
      throw toAppError(err);
    }
  }

  lastUsage(): AiUsage {
    return { latencyMs: this.latencyMs, tokensUsed: this.tokensUsed };
  }
}

function toAppError(err: unknown): AppError {
  const message =
    err instanceof Error && err.message
      ? (err.message.match(/^[^\n{]*/) as string[])[0].trim().slice(0, 300)
      : "AI provider request failed";
  // A 429 (rate limit) must survive as a 429 so the queue back-off and the
  // per-user limiter can react to it.
  if (/rate limit|429|quota/i.test(message)) {
    return new AppError("The AI service is rate-limited right now", 429);
  }
  return new AppError(message || "AI provider request failed", 502);
}

export const geminiProvider: AIProvider = new GeminiProvider();
