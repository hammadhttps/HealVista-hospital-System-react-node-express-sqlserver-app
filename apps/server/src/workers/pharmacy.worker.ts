import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import { scanLowStock, scanExpiring } from "../services/pharmacy.service.js";
import { logger } from "../utils/logger.js";

/**
 * Hourly pharmacy sweep worker.
 *
 * Runs the low-stock and expiring-stock scans that the checklist's "one alert per
 * item per day" dedupe lives behind. The dedupe keys are shared with the on-demand
 * `checkLowStock` path, so a dispense that drops a medicine low this hour will not
 * double-announce it when the sweep runs minutes later.
 */
export function startPharmacyWorker(): Worker | null {
  if (!redis) {
    logger.warn("[pharmacy-worker] Redis not available, worker disabled");
    return null;
  }

  const worker = new Worker(
    "pharmacy-sweep",
    async () => {
      const [lowStock, expiring] = await Promise.all([scanLowStock(), scanExpiring()]);
      logger.info(
        { lowStock, expiring },
        "[pharmacy-worker] Stock sweep complete (alerts dispatched)",
      );
      return { lowStock, expiring };
    },
    { connection: redis },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "[pharmacy-worker] Completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[pharmacy-worker] Failed");
  });

  return worker;
}
