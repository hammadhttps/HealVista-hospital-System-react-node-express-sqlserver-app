import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import { prisma } from "../config/db.js";
import { dispatchNotification, clearReminderJobIds } from "../services/notification.service.js";
import { logger } from "../utils/logger.js";

export function startReminderWorker(): Worker | null {
  if (!redis) {
    logger.warn("[reminder-worker] Redis not available, worker disabled");
    return null;
  }

  const worker = new Worker(
    "reminders",
    async (job) => {
      const { appointmentId, type } = job.data as {
        appointmentId: string;
        type: "24h" | "1h" | "follow-up";
      };

      logger.info({ jobId: job.id, appointmentId, type }, "[reminder-worker] Processing reminder");

      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          patient: { include: { user: true } },
          doctor: { include: { user: true } },
        },
      });

      if (!appointment || appointment.deletedAt) {
        logger.warn({ appointmentId }, "[reminder-worker] Appointment not found or deleted");
        return;
      }

      // A follow-up fires *after* the visit, so it expects COMPLETED — the opposite
      // of the pre-visit reminders, which are pointless once the visit is over.
      if (type === "follow-up") {
        if (appointment.status !== "COMPLETED") {
          logger.info(
            { appointmentId, status: appointment.status },
            "[reminder-worker] Skipping follow-up - visit did not complete",
          );
          return;
        }

        await dispatchNotification({
          userId: appointment.patient.user.id,
          type: "FOLLOW_UP_REMINDER",
          title: "Time to book your follow-up",
          message: `Dr. ${appointment.doctor.user.email} asked you to book a follow-up visit. Tap to choose a time.`,
          linkUrl: `/doctors/${appointment.doctorId}`,
          data: {
            doctorName: appointment.doctor.user.email,
            appointmentNo: appointment.appointmentNo,
          },
        });

        logger.info({ appointmentId }, "[reminder-worker] Follow-up reminder dispatched");
        return;
      }

      if (appointment.status !== "CONFIRMED" && appointment.status !== "CHECKED_IN") {
        logger.info(
          { appointmentId, status: appointment.status },
          "[reminder-worker] Skipping - not active",
        );
        return;
      }

      await clearReminderJobIds(appointmentId);

      await dispatchNotification({
        userId: appointment.patient.user.id,
        type: "APPOINTMENT_REMINDER",
        title: type === "24h" ? "Appointment Tomorrow" : "Appointment in 1 Hour",
        message:
          type === "24h"
            ? `You have an appointment with Dr. ${appointment.doctor.user.email} tomorrow.`
            : `Your appointment with Dr. ${appointment.doctor.user.email} starts in 1 hour.`,
        linkUrl: `/patient/appointments/${appointmentId}`,
        data: {
          doctorName: appointment.doctor.user.email,
          date: appointment.createdAt.toISOString().split("T")[0],
          time: appointment.slotId,
          appointmentNo: appointment.appointmentNo,
        },
      });

      logger.info({ appointmentId, type }, "[reminder-worker] Reminder dispatched");
    },
    { connection: redis },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "[reminder-worker] Completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[reminder-worker] Failed");
  });

  return worker;
}
