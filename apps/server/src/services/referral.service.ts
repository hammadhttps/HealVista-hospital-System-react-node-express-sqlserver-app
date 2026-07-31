import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import { assertClinicalAccess, type Actor } from "./access.service.js";
import { dispatchNotification } from "./notification.service.js";

/**
 * Referrals — one doctor handing a patient to another, or to a department.
 *
 * A referral is also an *authorisation*: access.service treats `toDoctorId` as a
 * reason a doctor may read a patient they have never met. That makes creating one a
 * privileged act, so only a doctor with existing access can, and every referral is
 * audited on both sides.
 */

async function requireDoctor(actor: Actor) {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: actor.userId },
    select: { id: true, fullName: true },
  });
  if (!doctor) throw new AppError("Doctor record not found", 404);
  return doctor;
}

export async function createReferral(
  input: {
    patientId: string;
    toDoctorId?: string;
    toDepartmentId?: string;
    appointmentId?: string;
    reason: string;
    notes?: string;
  },
  actor: Actor,
) {
  const fromDoctor = await requireDoctor(actor);

  // The referring doctor must already have access — otherwise a referral becomes a
  // way to grant yourself access to a stranger by referring them to a colleague.
  await assertClinicalAccess(input.patientId, actor);

  if (!input.toDoctorId && !input.toDepartmentId) {
    throw new AppError("A referral needs a destination doctor or department", 400);
  }
  if (!input.reason?.trim()) {
    throw new AppError("A referral needs a reason", 400);
  }
  if (input.toDoctorId === fromDoctor.id) {
    throw new AppError("You cannot refer a patient to yourself", 400);
  }

  if (input.toDoctorId) {
    const target = await prisma.doctor.findUnique({
      where: { id: input.toDoctorId },
      select: { id: true, deletedAt: true },
    });
    if (!target || target.deletedAt) throw new AppError("Referred-to doctor not found", 404);
  }

  const referral = await prisma.referral.create({
    data: {
      patientId: input.patientId,
      fromDoctorId: fromDoctor.id,
      toDoctorId: input.toDoctorId ?? null,
      toDepartmentId: input.toDepartmentId ?? null,
      appointmentId: input.appointmentId ?? null,
      reason: input.reason.trim(),
      notes: input.notes ?? null,
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "REFERRAL_CREATED",
    targetType: "referral",
    targetId: referral.id,
    metadata: {
      patientId: input.patientId,
      toDoctorId: input.toDoctorId ?? null,
      toDepartmentId: input.toDepartmentId ?? null,
      // Recorded explicitly: this referral is what will justify the receiving
      // doctor's access to the record later.
      grantsRecordAccess: Boolean(input.toDoctorId),
    },
  });

  if (input.toDoctorId) {
    const target = await prisma.doctor.findUnique({
      where: { id: input.toDoctorId },
      select: { userId: true },
    });
    if (target?.userId) {
      try {
        await dispatchNotification({
          userId: target.userId,
          type: "GENERAL",
          title: "New referral",
          message: `Dr. ${fromDoctor.fullName} has referred a patient to you: ${input.reason.trim()}`,
          linkUrl: `/referrals/${referral.id}`,
          data: { referralId: referral.id },
        });
      } catch (err) {
        console.error("[referral] Failed to notify referred-to doctor:", err);
      }
    }
  }

  return referral;
}

export async function respondToReferral(
  referralId: string,
  status: "ACCEPTED" | "DECLINED" | "COMPLETED",
  actor: Actor,
) {
  const doctor = await requireDoctor(actor);

  const referral = await prisma.referral.findUnique({ where: { id: referralId } });
  if (!referral) throw new AppError("Referral not found", 404);
  if (referral.toDoctorId !== doctor.id) {
    throw new AppError("This referral was not addressed to you", 403);
  }
  if (referral.status !== "PENDING" && status !== "COMPLETED") {
    throw new AppError(`This referral has already been ${referral.status.toLowerCase()}`, 409);
  }

  const updated = await prisma.referral.update({
    where: { id: referralId },
    data: { status },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: `REFERRAL_${status}`,
    targetType: "referral",
    targetId: referralId,
    metadata: { patientId: referral.patientId },
  });

  return updated;
}

/** Referrals addressed to the calling doctor — their inbox. */
export async function listIncoming(actor: Actor, status?: string) {
  const doctor = await requireDoctor(actor);

  return prisma.referral.findMany({
    where: { toDoctorId: doctor.id, ...(status ? { status: status as never } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

/** Referrals the calling doctor has made. */
export async function listOutgoing(actor: Actor) {
  const doctor = await requireDoctor(actor);

  return prisma.referral.findMany({
    where: { fromDoctorId: doctor.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function listForPatient(patientId: string, actor: Actor) {
  await assertClinicalAccess(patientId, actor);

  return prisma.referral.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
  });
}
