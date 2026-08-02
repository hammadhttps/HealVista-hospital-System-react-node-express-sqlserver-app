import { Worker } from "bullmq";
import { bullConnection } from "../config/redis.js";
import { sendEmail, isEmailEnabled } from "../services/email.service.js";
import { logger } from "../utils/logger.js";

export function startEmailWorker(): Worker | null {
  if (!bullConnection) {
    logger.warn("[email-worker] Redis not available, worker disabled");
    return null;
  }

  const worker = new Worker(
    "emails",
    async (job) => {
      const { to, notificationType, data } = job.data;
      logger.info({ jobId: job.id, to, type: notificationType }, "[email-worker] Sending email");

      // No SMTP credentials and not in log mode: this job cannot be done, but
      // it is not an error either. Completing it keeps the queue clean and
      // stops failure spam until SMTP is configured.
      if (!isEmailEnabled()) {
        logger.warn(
          { jobId: job.id, to, type: notificationType },
          "[email-worker] Email disabled (SMTP unset, MAILER!=log) — skipping job",
        );
        return { sent: false, skipped: true };
      }

      const sent = await sendEmail(to, notificationType, data);
      if (!sent) throw new Error(`Failed to send email to ${to}`);
      return { sent: true };
    },
    { connection: bullConnection },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "[email-worker] Completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[email-worker] Failed");
  });

  return worker;
}
