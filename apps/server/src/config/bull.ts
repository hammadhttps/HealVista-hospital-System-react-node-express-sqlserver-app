import { Queue, Worker } from "bullmq";
import { redis } from "./redis";

const connection = redis
  ? { connection: redis }
  : { connection: { host: "localhost", port: 6379 } };

export const slotGenerationQueue = redis
  ? new Queue("slot-generation", {
      ...connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      },
    })
  : null;

export async function setupSlotGenerationJob() {
  if (!slotGenerationQueue || !redis) {
    console.warn("[bull] Redis not available, skipping slot generation schedule");
    return;
  }

  const schedulers = await slotGenerationQueue.getJobSchedulers();
  const existing = schedulers.find((s: { name: string }) => s.name === "nightly-slot-generation");

  if (!existing) {
    await slotGenerationQueue.upsertJobScheduler(
      "nightly-slot-generation",
      { pattern: "0 2 * * *" },
      { name: "generate-slots", data: {} },
    );
  }
}
