import { Worker } from "bullmq";
import { bullConnection } from "../config/redis.js";
import { logger } from "../utils/logger.js";
import { embedSource } from "./embeddings.service.js";
import { AppError } from "../utils/AppError.js";

/**
 * Embedding worker.
 *
 * Runs the load → strip PII → chunk → embed → upsert pipeline for enqueued
 * sources. Design constraints from the free tier (docs/architecture/ai-rag.md §9):
 *
 * - **Concurrency throttled** (2 workers) so requests-per-minute stay under the
 *   free-tier cap even while a batch backfills.
 * - **429 backs off exponentially** — BullMQ retries the job with exponential
 *   delay, and the provider maps Gemini's quota errors to a typed 429 that
 *   survives as a retryable failure rather than poisoning the queue.
 */
export function startEmbeddingWorker(): Worker | null {
  if (!bullConnection) {
    logger.warn("[embeddings-worker] Redis not available, worker disabled");
    return null;
  }

  const worker = new Worker(
    "embeddings",
    async (job) => {
      const { sourceType, sourceId } = job.data as {
        sourceType: Parameters<typeof embedSource>[0];
        sourceId: string;
      };
      await embedSource(sourceType, sourceId);
    },
    {
      connection: bullConnection,
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    // A 429 is expected under free-tier limits — log it softly; BullMQ backs off.
    if (err instanceof AppError && err.statusCode === 429) {
      logger.warn({ jobId: job?.id }, "[embeddings-worker] Rate limited, backing off");
      return;
    }
    logger.error({ jobId: job?.id, err }, "[embeddings-worker] Failed");
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "[embeddings-worker] Completed");
  });

  return worker;
}
