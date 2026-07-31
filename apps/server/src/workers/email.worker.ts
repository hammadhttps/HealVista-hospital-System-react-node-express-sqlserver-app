import { Worker } from "bullmq";
import { redis } from "../config/redis";
import { sendEmail } from "../services/email.service";
import { logger } from "../utils/logger";

export function startEmailWorker(): Worker | null {
  if (!redis) {
    logger.warn("[email-worker] Redis not available, worker disabled");
    return null;
  }

  const worker = new Worker(
    "emails",
    async (job) => {
      const { to, notificationType, data } = job.data;
      logger.info({ jobId: job.id, to, type: notificationType }, "[email-worker] Sending email");
      const sent = await sendEmail(to, notificationType, data);
      if (!sent) throw new Error(`Failed to send email to ${to}`);
      return { sent: true };
    },
    { connection: redis },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "[email-worker] Completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[email-worker] Failed");
  });

  return worker;
}
