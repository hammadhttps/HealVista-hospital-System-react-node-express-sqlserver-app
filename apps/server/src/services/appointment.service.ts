import { prisma } from "../config/db.js";
import { redis } from "../config/redis.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import { unlockSlotInRedis } from "./slot.service.js";
import { getDependentPatientIds } from "./access.service.js";
import {
  dispatchNotification,
  storeReminderJobId,
  clearReminderJobIds,
} from "./notification.service.js";
import { addReminderJob } from "../config/bull.js";
import { createThreadForAppointment } from "./chat.service.js";
import crypto from "crypto";
import PDFDocument from "pdfkit";

function generateAppointmentNo(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomInt(1000, 9999);
  return `APT-${ts}-${rand}`;
}

function generateQrToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

/** The caller identity every scoped read/write needs. Mirrors `JwtPayload`. */
export interface Actor {
  userId: string;
  role: string;
}

/** Front-desk and admin roles see the whole schedule; clinical/patient roles do not. */
const FRONT_DESK_ROLES = ["RECEPTIONIST", "ADMIN"];

/**
 * Resolves the appointment filter a caller is allowed to use.
 *
 * `requireRole()` proves the caller is *a* doctor, not *this* appointment's doctor —
 * so scope is resolved here and applied in the query, never after it.
 */
async function resolveAppointmentScope(actor: Actor): Promise<{
  patientIds?: string[];
  doctorId?: string;
}> {
  if (FRONT_DESK_ROLES.includes(actor.role)) return {};

  if (actor.role === "PATIENT") {
    const patient = await prisma.patient.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (!patient) throw new AppError("Patient record not found", 404);

    // A patient's own appointments plus those of anyone they are an authorised
    // guardian for. Booking permission is the relevant one here, not records.
    const dependents = await getDependentPatientIds(patient.id, "booking");
    return { patientIds: [patient.id, ...dependents] };
  }

  if (actor.role === "DOCTOR") {
    const doctor = await prisma.doctor.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (!doctor) throw new AppError("Doctor record not found", 404);
    return { doctorId: doctor.id };
  }

  throw new AppError("Not authorised to view appointments", 403);
}

/**
 * Loads an appointment and asserts the caller may see it.
 * Throws 403 rather than 404 only when the record exists but is someone else's.
 */
async function assertCanAccessAppointment(appointmentId: string, actor: Actor) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      patientId: true,
      patient: { select: { userId: true } },
      doctor: { select: { userId: true } },
    },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);

  if (FRONT_DESK_ROLES.includes(actor.role)) return;
  if (actor.role === "PATIENT" && appointment.patient?.userId === actor.userId) return;
  if (actor.role === "DOCTOR" && appointment.doctor?.userId === actor.userId) return;

  // A guardian reaches their dependant's appointment. Checked after the direct match
  // so the common case costs no extra query.
  if (actor.role === "PATIENT") {
    const self = await prisma.patient.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (self) {
      const dependents = await getDependentPatientIds(self.id, "booking");
      if (dependents.includes(appointment.patientId)) return;
    }
  }

  throw new AppError("Not authorised to access this appointment", 403);
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
        patient: { select: { id: true, fullName: true, mrn: true, userId: true } },
        doctor: { select: { id: true, fullName: true, userId: true } },
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

    if (appointment.status === "CONFIRMED") {
      try {
        await dispatchNotification({
          userId: appointment.patient.userId,
          type: "APPOINTMENT_CONFIRMED",
          title: "Appointment Confirmed",
          message: `Your appointment with Dr. ${appointment.doctor.fullName} on ${slot.startTime.toLocaleDateString()} at ${slot.startTime.toLocaleTimeString()} is confirmed.`,
          linkUrl: `/patient/appointments/${appointment.id}`,
          data: {
            doctorName: appointment.doctor.fullName,
            date: slot.startTime.toISOString().split("T")[0],
            time: slot.startTime.toTimeString().slice(0, 5),
            appointmentNo: appointment.appointmentNo,
          },
        });

        await createThreadForAppointment(appointment.id);

        const now = Date.now();
        const slotTime = slot.startTime.getTime();
        const twentyFourHoursBefore = slotTime - 24 * 60 * 60 * 1000;
        const oneHourBefore = slotTime - 60 * 60 * 1000;

        const jobIds: string[] = [];
        if (twentyFourHoursBefore > now) {
          const id = await addReminderJob(twentyFourHoursBefore - now, {
            appointmentId: appointment.id,
            type: "24h",
          });
          if (id) jobIds.push(id);
        }
        if (oneHourBefore > now) {
          const id = await addReminderJob(oneHourBefore - now, {
            appointmentId: appointment.id,
            type: "1h",
          });
          if (id) jobIds.push(id);
        }
        if (jobIds.length > 0) {
          await storeReminderJobId(appointment.id, jobIds);
        }
      } catch (err) {
        console.error("[appointment] Failed to dispatch notifications:", err);
      }
    }

    return appointment;
  } catch (err: any) {
    if (err.code === "P2002") {
      throw new AppError("This slot was just booked by someone else", 409);
    }
    throw err;
  }
}

export async function getAppointments(
  filters: {
    patientId?: string;
    doctorId?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    departmentId?: string;
    page?: number;
    limit?: number;
  },
  actor: Actor,
) {
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

  // Scope first, then apply the caller's own filters — a requested filter can
  // narrow the scope but must never widen it.
  const scope = await resolveAppointmentScope(actor);

  if (scope.patientIds) {
    // A requested patientId may narrow the scope to one dependant, but only if it is
    // already inside it. Anything else falls back to the full authorised set rather
    // than honouring the request.
    where.patientId =
      patientId && scope.patientIds.includes(patientId)
        ? patientId
        : { in: scope.patientIds };
  } else if (patientId) {
    where.patientId = patientId;
  }

  if (scope.doctorId) where.doctorId = scope.doctorId;
  else if (doctorId) where.doctorId = doctorId;
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

export async function getAppointmentById(appointmentId: string, actor: Actor) {
  await assertCanAccessAppointment(appointmentId, actor);
  return loadAppointmentById(appointmentId);
}

async function loadAppointmentById(appointmentId: string) {
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
  actor: Actor,
) {
  await assertCanAccessAppointment(appointmentId, actor);

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      slot: true,
      patient: { select: { userId: true, fullName: true } },
      doctor: { select: { fullName: true } },
    },
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

  try {
    await clearReminderJobIds(appointmentId);
    await dispatchNotification({
      userId: appointment.patient.userId,
      type: "APPOINTMENT_CANCELLED",
      title: "Appointment Cancelled",
      message: `Your appointment with Dr. ${appointment.doctor.fullName} has been cancelled.`,
      linkUrl: `/patient/appointments`,
      data: {
        doctorName: appointment.doctor.fullName,
        date: appointment.slot.startTime.toISOString().split("T")[0],
        reason,
      },
    });
  } catch (err) {
    console.error("[appointment] Failed to dispatch cancellation notification:", err);
  }

  return cancelled;
}

export async function rescheduleAppointment(
  appointmentId: string,
  newSlotId: string,
  reason: string | null | undefined,
  userId: string,
  actor: Actor,
) {
  await assertCanAccessAppointment(appointmentId, actor);

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      slot: true,
      patient: { select: { userId: true, fullName: true } },
      doctor: { select: { fullName: true } },
    },
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

    try {
      await clearReminderJobIds(appointmentId);
      const newSlot = await prisma.appointmentSlot.findUnique({ where: { id: newSlotId } });
      if (newSlot) {
        const slotTime = newSlot.startTime.getTime();
        const jobIds: string[] = [];
        const twentyFourHoursBefore = slotTime - 24 * 60 * 60 * 1000;
        const oneHourBefore = slotTime - 60 * 60 * 1000;

        if (twentyFourHoursBefore > now.getTime()) {
          const id = await addReminderJob(twentyFourHoursBefore - now.getTime(), {
            appointmentId,
            type: "24h",
          });
          if (id) jobIds.push(id);
        }
        if (oneHourBefore > now.getTime()) {
          const id = await addReminderJob(oneHourBefore - now.getTime(), {
            appointmentId,
            type: "1h",
          });
          if (id) jobIds.push(id);
        }
        if (jobIds.length > 0) await storeReminderJobId(appointmentId, jobIds);

        await dispatchNotification({
          userId: appointment.patient.userId,
          type: "APPOINTMENT_RESCHEDULED",
          title: "Appointment Rescheduled",
          message: `Your appointment with Dr. ${appointment.doctor.fullName} has been moved to ${newSlot.startTime.toLocaleDateString()} at ${newSlot.startTime.toLocaleTimeString()}.`,
          linkUrl: `/patient/appointments/${appointmentId}`,
          data: {
            doctorName: appointment.doctor.fullName,
            newDate: newSlot.startTime.toISOString().split("T")[0],
            newTime: newSlot.startTime.toTimeString().slice(0, 5),
          },
        });
      }
    } catch (err) {
      console.error("[appointment] Failed to dispatch reschedule notification:", err);
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

export async function completeConsultation(
  appointmentId: string,
  doctorUserId: string,
  followUpInDays?: number,
) {
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

  // A completed consultation with no signed note is an encounter with no record of
  // what happened in it. Enforced in the service so no other caller can route around
  // it. Unlike the billing and follow-up steps below, this one blocks.
  const { assertNoteSignedForCompletion } = await import("./note.service.js");
  await assertNoteSignedForCompletion(appointmentId);

  const completed = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "COMPLETED", consultEndAt: new Date() },
  });

  // Open a draft bill seeded with the consultation fee. Billing failures must never
  // block a doctor from closing a consultation, so this is best-effort — reception
  // can always raise the bill by hand.
  try {
    const { createBillForAppointment } = await import("./bill.service.js");
    await createBillForAppointment(appointmentId, doctorUserId);
  } catch (err) {
    console.error("[appointment] Failed to open bill for completed consultation:", err);
  }

  // A doctor-set follow-up interval schedules a "time to book again" nudge. The
  // delay is enqueued rather than stored, so a failure here must not undo a
  // completed consultation.
  if (followUpInDays && followUpInDays > 0) {
    try {
      const delayMs = followUpInDays * 24 * 60 * 60 * 1000;
      await addReminderJob(delayMs, { appointmentId, type: "follow-up" });
    } catch (err) {
      console.error("[appointment] Failed to schedule follow-up reminder:", err);
    }
  }

  return completed;
}

export async function getAppointmentReceipt(appointmentId: string, actor: Actor) {
  await assertCanAccessAppointment(appointmentId, actor);

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

/**
 * Renders the appointment receipt as a PDF.
 * Returns a stream so the controller never buffers the whole document in memory.
 */
export async function generateAppointmentReceiptPdf(appointmentId: string, actor: Actor) {
  const appointment = await getAppointmentReceipt(appointmentId, actor);
  const settings = await getHospitalSettingsForReceipt();

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  doc.fontSize(20).text(settings.hospitalName, { align: "center" });
  if (settings.address) {
    doc.fontSize(9).fillColor("#666").text(settings.address, { align: "center" });
  }
  doc.moveDown(1.5).fillColor("#000");

  doc.fontSize(14).text("Appointment Receipt", { align: "center" });
  doc.moveDown(1);

  const line = (label: string, value: string) => {
    doc.fontSize(10).fillColor("#666").text(label, { continued: true });
    doc.fillColor("#000").text(`  ${value}`);
    doc.moveDown(0.4);
  };

  line("Appointment No", appointment.appointmentNo);
  line("Status", appointment.status);
  line("Patient", `${appointment.patient.fullName} (MRN ${appointment.patient.mrn})`);
  line("Doctor", appointment.doctor.fullName);
  if (appointment.slot) {
    line("Scheduled", appointment.slot.startTime.toISOString().replace("T", " ").slice(0, 16));
  }
  if (appointment.checkedInAt) {
    line("Checked in", appointment.checkedInAt.toISOString().replace("T", " ").slice(0, 16));
  }

  doc.moveDown(0.6);
  const fee = Number(appointment.doctor.consultationFee ?? 0);
  line("Consultation fee", `${settings.currency} ${fee.toFixed(2)}`);

  doc.moveDown(2);
  doc
    .fontSize(8)
    .fillColor("#999")
    .text(
      "This receipt confirms the appointment booking only. It is not a payment receipt.",
      { align: "center" },
    );

  doc.end();
  return { doc, filename: `receipt-${appointment.appointmentNo}.pdf` };
}

async function getHospitalSettingsForReceipt() {
  const settings = await prisma.hospitalSettings.findUnique({ where: { id: "singleton" } });
  const address = [settings?.addressLine1, settings?.city, settings?.country]
    .filter(Boolean)
    .join(", ");

  return {
    hospitalName: settings?.name ?? "MediCore Hospital",
    address,
    currency: settings?.currency ?? "USD",
  };
}
