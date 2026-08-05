import { z } from "zod";

/**
 * AI-layer input schemas (Phase 5).
 *
 * The server-side AI *output* schemas live next to the features that consume them
 * (`apps/server/src/ai/`). These are the request shapes shared with the client so
 * the forms and the routes validate against the same contract.
 */

/** Stateless symptom-checker turn. */
export const symptomCheckSchema = z.object({
  message: z.string().min(1).max(1000),
});

export type SymptomCheckInput = z.infer<typeof symptomCheckSchema>;

/**
 * RAG assistant turn. A patient omits `patientId` (their scope is themselves plus
 * dependants); a doctor supplies the patient they are asking about, which the
 * service verifies against their retrieval scope before any model call.
 */
export const assistantQuerySchema = z.object({
  question: z.string().min(1).max(2000),
  patientId: z.string().uuid().optional(),
});

export type AssistantQueryInput = z.infer<typeof assistantQuerySchema>;

/**
 * Appointment AI assistant. A patient asks about their own appointment, a doctor
 * about one they treat; the service verifies the relationship and returns a guided
 * answer. `question` is optional — omitted, it produces a prep/recap of the visit.
 */
export const appointmentAssistSchema = z.object({
  question: z.string().min(1).max(1000).optional(),
});

export type AppointmentAssistInput = z.infer<typeof appointmentAssistSchema>;

/** Timeline summary targets one patient via the path param. */
export const timelineSummaryParamsSchema = z.object({
  patientId: z.string().uuid(),
});

export type TimelineSummaryParams = z.infer<typeof timelineSummaryParamsSchema>;

/** Semantic record search, doctor-facing. Returns cited chunks, no generation. */
export const semanticSearchSchema = z.object({
  query: z.string().min(1).max(1000),
  patientId: z.string().uuid(),
  k: z.number().int().min(1).max(20).optional(),
});

export type SemanticSearchInput = z.infer<typeof semanticSearchSchema>;

/**
 * Scope-wide semantic search — doctor-facing. Searches across *every* patient the
 * doctor may read (no single patientId) so a natural-language query like "patients
 * with worsening blood sugar" can surface matching notes from the whole panel.
 */
export const semanticSearchAllSchema = z.object({
  query: z.string().min(1).max(1000),
  k: z.number().int().min(1).max(20).optional(),
});

export type SemanticSearchAllInput = z.infer<typeof semanticSearchAllSchema>;

/** Hospital knowledge base — read by staff, written by ADMIN. */
export const kbArticleSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50_000),
  category: z.string().min(1).max(100),
  slug: z.string().min(1).max(200).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  isPublished: z.boolean().optional(),
});

export const kbArticleUpdateSchema = kbArticleSchema.partial();

export type KbArticleInput = z.infer<typeof kbArticleSchema>;
export type KbArticleUpdateInput = z.infer<typeof kbArticleUpdateSchema>;

/** Hospital knowledge assistant turn — any staff member. */
export const kbAskSchema = z.object({
  question: z.string().min(1).max(1000),
});

export type KbAskInput = z.infer<typeof kbAskSchema>;

/** Analytics assistant turn — ADMIN. */
export const analyticsQuerySchema = z.object({
  question: z.string().min(1).max(1000),
});

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
