import { Worker } from "bullmq";
import { bullConnection } from "../config/redis.js";
import { summarizeRecord } from "../ai/directPrompts.service.js";
import { logger } from "../utils/logger.js";

/**
 * Report summary worker.
 *
 * A queued direct-prompt feature: after a record's text is extracted, this job
 * generates the `MedicalRecord.aiSummary` (key values, flags, plain-language
 * summary). Queueing keeps bursts off the free-tier rate cap. The job is
 * idempotent — a record already summarised is skipped — so retries and manual
 * re-enqueues are harmless.
 */
export function startSummariesWorker(): Worker | null {
  if (!bullConnection) {
    logger.warn("[summaries-worker] Redis not available, worker disabled");
    return null;
  }

  const worker = new Worker(
    "summaries",
    async (job) => {
      const { recordId } = job.data as { recordId: string };
      await summarizeRecord(recordId);
    },
    { connection: bullConnection },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "[summaries-worker] Completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[summaries-worker] Failed");
  });

  return worker;
}
