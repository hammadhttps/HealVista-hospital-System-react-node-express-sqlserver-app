import { prisma } from "../config/db";
import { redis } from "../config/redis";
import { AppError } from "../utils/AppError";
import { writeAuditLog } from "../utils/audit";
import { unlockSlotInRedis } from "./slot.service";
import crypto from "crypto";

function generateAppointmentNo(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomInt(1000, 9999);
  return `APT-${ts}-${rand}`;
}

function generateQrToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

function getMinCheckInWindow(slotStart: Date): Date {
  return new Date(slotStart.getTime() - 30 * 60 * 1000);
}

function getMaxCheckInWindow(slotStart: Date): Date {
  return new Date(slotStart.getTime() + 30 * 60 * 1000);
}

export async function bookAppointment(data: {
  patientId: string;
  doctorId: string;
  slotId: string;
  departmentId?: string;
  reasonNote?: string;
  source?: "ONLINE" | "WALK_IN" | "PHONE";
  createdById?: string;
}) {
  const slot = await prisma.appointmentSlot.findUnique({
    where: { id: data.slotId },
    include: { appointment: true },
  });
  if (!slot) throw new AppError("Slot not found", 404);
  if (slot.isBlocked) throw new AppError("This slot is blocked", 400);
  if (slot.isBooked || slot.appointment) throw new AppError("Slot already booked", 409);
  if (slot.doctorId !== data.doctorId)
    throw new AppError("Slot does not belong to this doctor", 400);

  const patient = await prisma.patient.findUnique({ where: { id: data.patientId } });
  if (!patient) throw new AppError("Patient not found", 404);

  const appointmentNo = generateAppointmentNo();
  const qrToken = generateQrToken();

  try {
    const appointment = await prisma.appointment.create({
      data: {
        appointmentNo,
        patientId: data.patientId,
        doctorId: data.doctorId,
        slotId: data.slotId,
        departmentId: data.departmentId ?? null,
        status: data.source === "WALK_IN" ? "CONFIRMED" : "PENDING_PAYMENT",
        source: data.source ?? "ONLINE",
        reasonNote: data.reasonNote ?? null,
        qrToken,
        createdById: data.createdById ?? null,
      },
      include: {
        patient: { select: { fullName: true, mrn: true } },
        doctor: { select: { fullName: true } },
        slot: true,
      },
    });

    await prisma.appointmentSlot.update({
      where: { id: data.slotId },
      data: { isBooked: true },
    });

    const actorId = data.createdById || patient.userId;
    await writeAuditLog({
      actorUserId: actorId,
      action: "APPOINTMENT_BOOKED",
      targetType: "appointment",
      targetId: appointment.id,
      metadata: { slotId: data.slotId, doctorId: data.doctorId },
    });

    await unlockSlotInRedis(data.slotId);
    if (redis) {
      await redis.del(`slots:${data.doctorId}:*`);
    }

    return appointment;
  } catch (err: any) {
    if (err.code === "P2002") {
      throw new AppError("This slot was just booked by someone else", 409);
    }
    throw err;
  }
}

export async function getAppointments(filters: {
  patientId?: string;
  doctorId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  departmentId?: string;
  page?: number;
  limit?: number;
}) {
  const where: any = { deletedAt: null };
  const {
    patientId,
    doctorId,
    status,
    fromDate,
    toDate,
    departmentId,
    page = 1,
    limit = 20,
  } = filters;

  if (patientId) where.patientId = patientId;
  if (doctorId) where.doctorId = doctorId;
  if (status) where.status = status;
  if (departmentId) where.departmentId = departmentId;
  if (fromDate || toDate) {
    where.slot = {};
    if (fromDate) where.slot.startTime = { gte: new Date(fromDate) };
    if (toDate) where.slot.startTime = { lte: new Date(toDate) };
  }

  const [appointments, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { id: true, fullName: true, mrn: true } },
        doctor: { select: { id: true, fullName: true } },
        slot: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.appointment.count({ where }),
  ]);

  return { appointments, total, page, limit };
}

export async function getAppointmentById(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { id: true, fullName: true, mrn: true, dateOfBirth: true, gender: true } },
      doctor: { select: { id: true, fullName: true } },
      slot: true,
    },
  });
  if (!appointment || appointment.deletedAt) throw new AppError("Appointment not found", 404);
  return appointment;
}

export async function cancelAppointment(
  appointmentId: string,
  reason: string,
  cancelledByUserId: string,
) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { slot: true },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(appointment.status)) {
    throw new AppError("Cannot cancel an appointment in this state", 400);
  }

  const cancelled = await prisma.$transaction(async (tx) => {
    const updated = await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    await tx.appointmentSlot.update({
      where: { id: appointment.slotId },
      data: { isBooked: false },
    });

    return updated;
  });

  await writeAuditLog({
    actorUserId: cancelledByUserId,
    action: "APPOINTMENT_CANCELLED",
    targetType: "appointment",
    targetId: appointmentId,
    metadata: { reason, slotId: appointment.slotId },
  });

  await unlockSlotInRedis(appointment.slotId);
  if (redis) {
    await redis.del(`slots:${appointment.doctorId}:*`);
  }

  return cancelled;
}

export async function rescheduleAppointment(
  appointmentId: string,
  newSlotId: string,
  reason: string | null | undefined,
  userId: string,
) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { slot: true },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(appointment.status)) {
    throw new AppError("Cannot reschedule an appointment in this state", 400);
  }

  const now = new Date();
  const twoHoursBefore = new Date(appointment.slot.startTime.getTime() - 2 * 60 * 60 * 1000);
  if (now > twoHoursBefore) {
    throw new AppError("Cannot reschedule within 2 hours of the appointment", 400);
  }

  const MAX_RESCHEDULES = 3;
  const rescheduleCount = await prisma.appointment.count({
    where: { rescheduledFromId: appointmentId },
  });
  if (rescheduleCount >= MAX_RESCHEDULES) {
    throw new AppError(`Maximum ${MAX_RESCHEDULES} reschedules allowed`, 400);
  }

  const newSlot = await prisma.appointmentSlot.findUnique({
    where: { id: newSlotId },
    include: { appointment: true },
  });
  if (!newSlot) throw new AppError("New slot not found", 404);
  if (newSlot.isBlocked) throw new AppError("New slot is blocked", 400);
  if (newSlot.isBooked || newSlot.appointment)
    throw new AppError("New slot is already booked", 409);

  try {
    const rescheduled = await prisma.$transaction(async (tx) => {
      await tx.appointmentSlot.update({
        where: { id: appointment.slotId },
        data: { isBooked: false },
      });

      await tx.appointmentSlot.update({
        where: { id: newSlotId },
        data: { isBooked: true },
      });

      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          slotId: newSlotId,
          reasonNote: reason || appointment.reasonNote,
          status: "CONFIRMED",
        },
      });

      return updated;
    });

    await writeAuditLog({
      actorUserId: userId,
      action: "APPOINTMENT_RESCHEDULED",
      targetType: "appointment",
      targetId: appointmentId,
      metadata: { oldSlotId: appointment.slotId, newSlotId, reason },
    });

    await unlockSlotInRedis(appointment.slotId);
    if (redis) {
      await redis.del(`slots:${appointment.doctorId}:*`);
    }

    return rescheduled;
  } catch (err: any) {
    if (err.code === "P2002") {
      throw new AppError("New slot was just booked by someone else", 409);
    }
    throw err;
  }
}

export async function checkInAppointment(qrToken: string, userId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { qrToken },
    include: { slot: true, patient: true },
  });
  if (!appointment) throw new AppError("Invalid QR token", 404);
  if (appointment.status !== "CONFIRMED") {
    throw new AppError(`Cannot check in appointment with status ${appointment.status}`, 400);
  }

  const now = new Date();
  const minWindow = getMinCheckInWindow(appointment.slot.startTime);
  const maxWindow = getMaxCheckInWindow(appointment.slot.startTime);

  if (now < minWindow) {
    throw new AppError(
      "Too early to check in. Please arrive closer to your appointment time.",
      400,
    );
  }
  if (now > maxWindow) {
    throw new AppError("Check-in window has passed. Please contact reception.", 400);
  }

  const checked = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "CHECKED_IN", checkedInAt: now },
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "APPOINTMENT_CHECKED_IN",
    targetType: "appointment",
    targetId: appointment.id,
    metadata: { qrToken },
  });

  return checked;
}

export async function startConsultation(appointmentId: string, doctorUserId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: true },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (appointment.doctor.userId !== doctorUserId) {
    throw new AppError("You can only start your own consultations", 403);
  }
  if (appointment.status !== "CHECKED_IN") {
    throw new AppError(`Cannot start consultation from status ${appointment.status}`, 400);
  }

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "IN_CONSULTATION", consultStartAt: new Date() },
  });
}

export async function completeConsultation(appointmentId: string, doctorUserId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: true },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (appointment.doctor.userId !== doctorUserId) {
    throw new AppError("You can only complete your own consultations", 403);
  }
  if (appointment.status !== "IN_CONSULTATION") {
    throw new AppError(`Cannot complete consultation from status ${appointment.status}`, 400);
  }

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "COMPLETED", consultEndAt: new Date() },
  });
}

export async function getAppointmentReceipt(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { fullName: true, mrn: true } },
      doctor: { select: { fullName: true, consultationFee: true } },
      slot: true,
    },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);
  return appointment;
}
