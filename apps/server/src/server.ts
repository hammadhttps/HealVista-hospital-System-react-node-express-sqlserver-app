import app from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { setupSocketIO } from "./sockets";
import { startSlotGenerationWorker } from "./slots/worker";
import { startEmailWorker } from "./workers/email.worker";
import { startSmsWorker } from "./workers/sms.worker";
import { startReminderWorker } from "./workers/reminder.worker";

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
