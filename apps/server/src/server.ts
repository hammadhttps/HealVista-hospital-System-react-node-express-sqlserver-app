import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { setupSocketIO } from "./sockets/index.js";
import { startSlotGenerationWorker } from "./slots/worker.js";
import { startEmailWorker } from "./workers/email.worker.js";
import { startSmsWorker } from "./workers/sms.worker.js";
import { startReminderWorker } from "./workers/reminder.worker.js";

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, `Server listening on port ${env.PORT}`);
});

setupSocketIO(server);

if (env.NODE_ENV !== "test") {
  startSlotGenerationWorker();
  startEmailWorker();
  startSmsWorker();
  startReminderWorker();
}

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  server.close(() => process.exit(0));
});
