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
