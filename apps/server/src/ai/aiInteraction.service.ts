import { prisma } from "../config/db.js";
import { logger } from "../utils/logger.js";

/**
 * AiInteraction logging — the audit trail of every AI call: which feature, how
 * long, how many tokens, which chunks were cited, and whether the call fell back.
 * Append-only by design; there is no update/delete path.
 */
export interface InteractionInput {
  userId: string;
  feature: string;
  question?: string | null;
  responseRef?: string | null;
  citedChunks?: string[];
  latencyMs?: number;
  tokensUsed?: number;
  wasFallback?: boolean;
}

/** Best-effort — an interaction log must never fail the feature that triggered it. */
export async function logInteraction(input: InteractionInput): Promise<void> {
  try {
    await prisma.aiInteraction.create({
      data: {
        userId: input.userId,
        feature: input.feature,
        question: input.question ?? null,
        responseRef: input.responseRef ?? null,
        citedChunks: input.citedChunks ?? [],
        latencyMs: input.latencyMs ?? null,
        tokensUsed: input.tokensUsed ?? null,
        wasFallback: input.wasFallback ?? false,
      },
    });
  } catch (err) {
    logger.error({ err, feature: input.feature }, "[ai-interaction] Failed to log interaction");
  }
}
