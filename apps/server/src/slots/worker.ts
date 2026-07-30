import { Worker } from "bullmq";
import { redis } from "../config/redis";
import { generateSlotsForAllDoctors } from "../services/slot.service";

export function startSlotGenerationWorker() {
  if (!redis) {
    console.warn("[bull] Redis not available, slot generation worker disabled");
    return null;
  }

  const worker = new Worker(
    "slot-generation",
    async () => {
      console.log("[bull] Running nightly slot generation");
      const results = await generateSlotsForAllDoctors();
      console.log(`[bull] Generated slots for ${results.length} doctors`);
      return results;
    },
    { connection: redis },
  );

  worker.on("completed", (job) => {
    console.log(`[bull] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[bull] Job ${job?.id} failed:`, err);
  });

  return worker;
}
