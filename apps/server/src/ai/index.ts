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
export type { AIProvider, AiUsage, GenerationImage } from "./ai.provider.js";
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
export {
  explainLabReport,
  explainPrescription,
  recommendFollowUp,
  ocrRecord,
  summarizeRecord,
  getReportSummary,
  enqueueReportSummary,
  type LabExplainResult,
  type RxExplainResult,
  type FollowUpResult,
  type OcrResult,
} from "./directPrompts.service.js";
export { generateDraft, type SoapDraftResult } from "./soapDraft.service.js";
export {
  isUneditedDraft,
  getStoredDraft,
  storeDraft,
  clearStoredDraft,
  type SoapDraft,
  type NoteDraftInput,
} from "./soapDraft.store.js";
export {
  checkSymptom,
  suggestDepartments,
  ruleBasedDepartmentSlugs,
  KNOWN_DEPARTMENT_SLUGS,
  type SymptomCheckResult,
  type DepartmentSuggestion,
} from "./symptom.service.js";
export {
  assistant,
  timelineSummary,
  semanticSearch,
  type AssistantResult,
  type Citation,
  type TimelineSummaryResult,
  type SearchHit,
} from "./rag.service.js";
export {
  listKbArticles,
  getKbArticle,
  createKbArticle,
  updateKbArticle,
  deleteKbArticle,
  askKb,
  type KbAskResult,
  type KbCitation,
} from "./kb.service.js";
export {
  runAnalyticsQuestion,
  type AnalyticsIntent,
  type AnalyticsResult,
  type AnalyticsTable,
} from "./analytics.service.js";
export { answerCacheKey, getCachedAnswer, setCachedAnswer } from "./answerCache.js";
