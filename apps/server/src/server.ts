import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { setupSocketIO } from "./sockets/index.js";
import { startSlotGenerationWorker } from "./slots/worker.js";
import { startEmailWorker } from "./workers/email.worker.js";
import { startSmsWorker } from "./workers/sms.worker.js";
import { startReminderWorker } from "./workers/reminder.worker.js";
import { startRecordWorker } from "./workers/record.worker.js";
import { startPharmacyWorker } from "./workers/pharmacy.worker.js";
import { startEmbeddingWorker } from "./ai/embeddings.worker.js";
import { startSummariesWorker } from "./workers/summaries.worker.js";
import { startComplianceWorker } from "./workers/compliance.worker.js";
import { setupSlotGenerationJob, setupPharmacySweepJob } from "./config/bull.js";

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, `Server listening on port ${env.PORT}`);
});

setupSocketIO(server);

if (env.NODE_ENV !== "test") {
  startSlotGenerationWorker();
  startEmailWorker();
  startSmsWorker();
  startReminderWorker();
  startRecordWorker();
  startPharmacyWorker();
  startEmbeddingWorker();
  startSummariesWorker();
  startComplianceWorker();

  // BullMQ job schedulers own the cadence in Redis, so the API process can restart
  // without losing a schedule. Both are idempotent — upsert only when absent.
  void setupSlotGenerationJob();
  void setupPharmacySweepJob();
}

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  server.close(() => process.exit(0));
});
