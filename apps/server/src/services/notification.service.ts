import { prisma } from "../config/db.js";
import { redis } from "../config/redis.js";
import { getIO } from "../sockets/index.js";
import { addNotificationJob, addReminderJob } from "../config/bull.js";
import type { NotificationType } from "@healvista/shared";

interface DispatchInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  linkUrl?: string;
  data?: Record<string, string>;
}

export async function dispatchNotification(input: DispatchInput): Promise<void> {
  const { userId, type, title, message, linkUrl, data } = input;

  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  /**
   * A critical lab value is a patient-safety alert, not a notification. Preferences
   * exist so people can mute noise; they must never be able to mute "this potassium
   * level is life-threatening". Every channel is used regardless of settings.
   */
  const overridesPreferences = type === "CRITICAL_RESULT";

  const channels: string[] = [];

  if (overridesPreferences || (prefs?.inAppEnabled ?? true)) {
    channels.push("in_app");
  }
  if (overridesPreferences || (prefs?.smsEnabled ?? true)) {
    channels.push("sms");
  }
  if (!overridesPreferences && (prefs?.emailEnabled ?? true)) {
    channels.push("email");
  }

  if (channels.length === 0) return;

  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      linkUrl,
      channels,
    },
  });

  // Per-category mutes. These are checked after the row is written so the item is
  // still there when the user next opens their notification list — muting a category
  // suppresses the interruption, not the record.
  if (!overridesPreferences) {
    const hasApptReminder = type === "APPOINTMENT_REMINDER" || type === "FOLLOW_UP_REMINDER";
    const isLab = type === "LAB_RESULT_READY";
    const isMarketing = type === "GENERAL";

    if (hasApptReminder && prefs?.appointmentReminders === false) return;
    if (isLab && prefs?.labResults === false) return;
    if (isMarketing && prefs?.marketing === false) return;
  }

  const socket = getIO().of("/notifications");
  socket.to(`user:${userId}`).emit("notification:new", notification);

  if (channels.includes("sms") && data && userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (user?.phone) {
      await addNotificationJob({
        type: "sms",
        to: user.phone,
        notificationType: type,
        data: data ?? {},
      });
    }
  }

  if (channels.includes("email") && data && userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (user?.email) {
      await addNotificationJob({
        type: "email",
        to: user.email,
        notificationType: type,
        data: data ?? {},
      });
    }
  }
}

export async function storeReminderJobId(appointmentId: string, jobIds: string[]): Promise<void> {
  if (!redis) return;
  const key = `reminder:appointment:${appointmentId}`;
  await redis.sadd(key, ...jobIds);
  await redis.expire(key, 86400 * 90);
}

export async function getReminderJobIds(appointmentId: string): Promise<string[]> {
  if (!redis) return [];
  const key = `reminder:appointment:${appointmentId}`;
  return redis.smembers(key);
}

export async function clearReminderJobIds(appointmentId: string): Promise<void> {
  if (!redis) return;
  const key = `reminder:appointment:${appointmentId}`;
  await redis.del(key);
}

/**
 * Schedules the "time to book a follow-up" nudge for an appointment.
 *
 * Callers are the prescription path (`followUpAfterDays`) and appointment completion
 * (`followUpInDays`). Deduplicated to one nudge per appointment — a doctor who both
 * prescribes with a follow-up and completes the visit with a follow-up interval must
 * not trigger two reminders.
 */
export async function scheduleFollowUpReminder(appointmentId: string, days: number): Promise<void> {
  if (!redis || !days || days <= 0) return;
  const key = `reminder:followup:appointment:${appointmentId}`;
  const existing = await redis.smembers(key);
  if (existing.length > 0) return;

  const delayMs = days * 24 * 60 * 60 * 1000;
  const id = await addReminderJob(delayMs, { appointmentId, type: "follow-up" });
  if (id) {
    await redis.sadd(key, id);
    await redis.expire(key, 86400 * 90);
  }
}
