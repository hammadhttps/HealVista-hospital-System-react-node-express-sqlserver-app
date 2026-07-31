import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import { sendSms } from "../services/sms.service.js";
import { logger } from "../utils/logger.js";

export function startSmsWorker(): Worker | null {
  if (!redis) {
    logger.warn("[sms-worker] Redis not available, worker disabled");
    return null;
  }

  const worker = new Worker(
    "sms",
    async (job) => {
      const { to, notificationType, data } = job.data;
      logger.info({ jobId: job.id, to, type: notificationType }, "[sms-worker] Sending SMS");
      const sent = await sendSms(to, notificationType, data);
      if (!sent) throw new Error(`Failed to send SMS to ${to}`);
      return { sent: true };
    },
    { connection: redis },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "[sms-worker] Completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[sms-worker] Failed");
  });

  return worker;
}
