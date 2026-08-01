import { z } from "zod";
import { AppError } from "../utils/AppError.js";
import type { AIProvider, GenerationImage } from "./ai.provider.js";

/**
 * The shared guardrail system prompt, prepended to **every** generation in the
 * project. Features may add feature-specific instructions on top, never remove
 * these rules (ai-rag.md §6).
 */
export const GUARDRAIL_SYSTEM_PROMPT = `You are MediCore's clinical assistant. Your output supports hospital staff and patients, and the following rules are absolute:

1. NEVER diagnose. You may suggest a specialty or department to see, and you may explain what a test or note says — but you must never name a condition as a fact.
2. NEVER contradict a doctor's note. If the information given conflicts with the question's premise, say so rather than resolving it.
3. NEVER give general medical advice unrelated to the records or context provided. Stay in scope.
4. If the information provided does not cover the question, say "I don't know" — never fill the gap from your own knowledge.
5. Emergency symptoms are never handled here — refer to emergency services immediately.
6. Your output is assistive. A clinician reviews everything you generate before it becomes part of a record.
7. Be concise and patient-safe. Use plain language for patients, precise terminology for staff.`;

/**
 * A typed error meaning "the AI layer is not available / produced unusable
 * output". Every caller treats this as the signal to run its non-AI fallback.
 */
export class AiGenerationError extends AppError {
  constructor(message: string, statusCode = 502) {
    super(message, statusCode);
    this.name = "AiGenerationError";
    // AppError sets the prototype to its own; restore the subclass chain so
    // `instanceof AiGenerationError` works (it is how callers pick their fallback).
    Object.setPrototypeOf(this, AiGenerationError.prototype);
  }
}

export interface GenerateValidatedOptions<T> {
  /** Human-readable feature name for the interaction log, e.g. "symptom-match". */
  feature: string;
  prompt: string;
  schema: z.ZodType<T>;
  system?: string;
  maxTokens?: number;
  /** Inline base64 images for the vision path (OCR). */
  images?: GenerationImage[];
  /** Retries on transient failure and malformed output. Default 1. */
  retries?: number;
}

/**
 * The only entry point feature services use to generate.
 *
 * - Passes the Zod schema to the model as its `responseSchema` (a hint).
 * - **Zod-validates the result** — a hint is not a guarantee, so a malformed
 *   payload is caught here, retried once, and only then surfaced as
 *   `AiGenerationError` so the caller's fallback runs.
 */
export async function generateValidated<T>(
  provider: AIProvider,
  opts: GenerateValidatedOptions<T>,
): Promise<T> {
  const retries = opts.retries ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await provider.generate({
        prompt: opts.prompt,
        schema: opts.schema,
        system: opts.system
          ? `${GUARDRAIL_SYSTEM_PROMPT}\n\n${opts.system}`
          : GUARDRAIL_SYSTEM_PROMPT,
        maxTokens: opts.maxTokens,
        images: opts.images,
      });
      return opts.schema.parse(raw);
    } catch (err) {
      lastError = err;
      // Non-retryable: the caller is forbidden (e.g. not configured) — don't burn
      // a retry on a 503. Rate limits are retryable with the queue/limiter, not here.
      if (err instanceof AppError && err.statusCode === 503) throw err;
      // A 422 (safety-declined) won't fix itself on retry.
      if (err instanceof AppError && err.statusCode === 422) throw err;
    }
  }

  throw toAiError(lastError);
}

function toAiError(err: unknown): AiGenerationError {
  if (err instanceof AiGenerationError) return err;
  if (err instanceof AppError && err.statusCode) {
    return new AiGenerationError(err.message, err.statusCode);
  }
  if (err instanceof z.ZodError) {
    return new AiGenerationError("The AI output did not match the expected structure");
  }
  return new AiGenerationError(err instanceof Error ? err.message : "AI generation failed", 502);
}
