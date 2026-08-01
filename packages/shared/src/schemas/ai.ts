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
