import { z } from "zod";

export const notificationTypeEnum = z.enum([
  "APPOINTMENT_CONFIRMED",
  "APPOINTMENT_RESCHEDULED",
  "APPOINTMENT_CANCELLED",
  "APPOINTMENT_REMINDER",
  "PAYMENT_RECEIPT",
  "LAB_RESULT_READY",
  // A life-threatening lab value. Deliberately distinct from LAB_RESULT_READY: this
  // one ignores notification preferences (see notification.service).
  "CRITICAL_RESULT",
  "LOW_STOCK_ALERT",
  "EXPIRY_ALERT",
  "BATCH_RECALL",
  "REFERRAL_CREATED",
  "FOLLOW_UP_REMINDER",
  "CHAT_MESSAGE",
  "GENERAL",
]);

export type NotificationType = z.infer<typeof notificationTypeEnum>;

export const channelEnum = z.enum(["in_app", "email", "sms"]);

export const updateNotificationPreferenceSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  appointmentReminders: z.boolean().optional(),
  labResults: z.boolean().optional(),
  marketing: z.boolean().optional(),
});

export type UpdateNotificationPreferenceInput = z.infer<typeof updateNotificationPreferenceSchema>;

export const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).optional(),
});

export type MarkReadInput = z.infer<typeof markReadSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
