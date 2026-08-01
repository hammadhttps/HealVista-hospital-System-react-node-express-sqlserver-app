import { Queue, Worker } from "bullmq";
import { redis } from "./redis.js";

const connection = redis
  ? { connection: redis }
  : { connection: { host: "localhost", port: 6379 } };

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 } as const,
  removeOnComplete: { age: 86400 },
  removeOnFail: { age: 604800 },
};

export const slotGenerationQueue = redis
  ? new Queue("slot-generation", { ...connection, defaultJobOptions })
  : null;

export const emailQueue = redis ? new Queue("emails", { ...connection, defaultJobOptions }) : null;

export const smsQueue = redis ? new Queue("sms", { ...connection, defaultJobOptions }) : null;

export const reminderQueue = redis
  ? new Queue("reminders", {
      ...connection,
      defaultJobOptions: {
        ...defaultJobOptions,
        removeOnComplete: { age: 86400 * 7 },
        removeOnFail: { age: 86400 * 30 },
      },
    })
  : null;

export const recordQueue = redis
  ? new Queue("record-extraction", { ...connection, defaultJobOptions })
  : null;

export const embeddingsQueue = redis
  ? new Queue("embeddings", { ...connection, defaultJobOptions })
  : null;

export const pharmacySweepQueue = redis
  ? new Queue("pharmacy-sweep", { ...connection, defaultJobOptions })
  : null;

interface NotificationJobData {
  type: "email" | "sms";
  to: string;
  notificationType: string;
  data: Record<string, string>;
}

export async function addNotificationJob(jobData: NotificationJobData): Promise<void> {
  const queue = jobData.type === "email" ? emailQueue : smsQueue;
  if (!queue) return;
  await queue.add(`${jobData.type}-${jobData.notificationType}`, jobData);
}

interface ReminderJobData {
  appointmentId: string;
  type: "24h" | "1h" | "follow-up";
}

export async function addReminderJob(
  delayMs: number,
  data: ReminderJobData,
): Promise<string | undefined> {
  if (!reminderQueue) return undefined;
  const job = await reminderQueue.add(`${data.type}-reminder`, data, { delay: delayMs });
  return job?.id;
}

export async function addRecordExtractionJob(recordId: string): Promise<void> {
  if (!recordQueue) return;
  await recordQueue.add("extract-text", { recordId });
}

/** Embeddable source types the embedding worker understands. */
export type EmbeddableSourceType =
  "consultation_note" | "lab_report" | "prescription" | "medical_record" | "kb_article";

/**
 * Enqueues a source for embedding. Best-effort by design — a queue outage must
 * never fail the clinical write that triggered it; the backfill script
 * (`npm run db:embed`) catches anything missed.
 */
export async function addEmbeddingJob(
  sourceType: EmbeddableSourceType,
  sourceId: string,
): Promise<void> {
  if (!embeddingsQueue) return;
  try {
    await embeddingsQueue.add("embed", { sourceType, sourceId });
  } catch (err) {
    console.error(`[embeddings] Failed to enqueue ${sourceType} ${sourceId}:`, err);
  }
}

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

/**
 * The hourly stock sweep: low-stock and expiring-stock alerts, each deduplicated to
 * one per item per day. Registered as a BullMQ scheduler so Redis owns the cadence
 * even when the API process restarts.
 */
export async function setupPharmacySweepJob() {
  if (!pharmacySweepQueue || !redis) {
    console.warn("[bull] Redis not available, skipping pharmacy sweep schedule");
    return;
  }

  const schedulers = await pharmacySweepQueue.getJobSchedulers();
  const existing = schedulers.find((s: { name: string }) => s.name === "hourly-pharmacy-sweep");

  if (!existing) {
    await pharmacySweepQueue.upsertJobScheduler(
      "hourly-pharmacy-sweep",
      { pattern: "0 * * * *" },
      { name: "stock-sweep", data: {} },
    );
  }
}
