import { env } from "../config/env.js";
import { geminiProvider } from "./gemini.provider.js";
import type { AIProvider } from "./ai.provider.js";

/**
 * The provider singleton. Only Gemini is implemented today; the roadmap's
 * "swap by config" story means OpenAI arrives here as a second branch, not as
 * edits to every feature file.
 */
export function getProvider(): AIProvider {
  if (env.AI_PROVIDER === "openai") {
    // Not implemented in this phase; falling through keeps a misconfigured
    // deployment on the (working) default rather than crashing at request time.
    return geminiProvider;
  }
  return geminiProvider;
}

/** Whether the AI layer is configured at all. Features use this to pick their fallback. */
export function isAiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

export { geminiProvider } from "./gemini.provider.js";
export type { AIProvider, AiUsage } from "./ai.provider.js";
export {
  GUARDRAIL_SYSTEM_PROMPT,
  AiGenerationError,
  generateValidated,
  type GenerateValidatedOptions,
} from "./guardrails.js";
export { stripPII, PII_TEST_TOKENS } from "./pii.js";
export { detectEmergency, type EmergencyResult } from "./emergency.js";
export { logInteraction, type InteractionInput } from "./aiInteraction.service.js";
export {
  resolveRetrievalScope,
  retrieve,
  type RetrievalScope,
  type RetrievedChunk,
  type RetrieveOptions,
} from "./retrieval.js";
