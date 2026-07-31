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

  const destinationName = await (async () => {
    if (input.toDoctorId) {
      const target = await prisma.doctor.findUnique({
        where: { id: input.toDoctorId },
        select: { fullName: true },
      });
      return target?.fullName ?? "a colleague";
    }
    if (input.toDepartmentId) {
      const dept = await prisma.department.findUnique({
        where: { id: input.toDepartmentId },
        select: { name: true },
      });
      return dept?.name ?? "another department";
    }
    return null;
  })();

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

  // The patient is the one who will act on the referral — notify them with a
  // prefilled search so they can find and book the destination. In-app only: no
  // `data` is passed, so no SMS/email jobs are queued for the patient.
  if (destinationName) {
    const patient = await prisma.patient.findUnique({
      where: { id: input.patientId },
      select: { userId: true },
    });
    if (patient?.userId) {
      try {
        await dispatchNotification({
          userId: patient.userId,
          type: "REFERRAL_CREATED",
          title: "You have been referred",
          message: `Dr. ${fromDoctor.fullName} referred you to ${destinationName}. Book an appointment to continue your care.`,
          linkUrl: "/doctors",
          data: { referralId: referral.id },
        });
      } catch (err) {
        console.error("[referral] Failed to notify patient:", err);
      }
    }
  }

  return referral;
}

/** A single referral — names resolved so the referral card renders without extra calls. */
export async function getReferral(referralId: string, actor: Actor) {
  const referral = await prisma.referral.findUnique({ where: { id: referralId } });
  if (!referral) throw new AppError("Referral not found", 404);

  if (actor.role === "DOCTOR") {
    const doctor = await requireDoctor(actor);
    if (referral.toDoctorId !== doctor.id && referral.fromDoctorId !== doctor.id) {
      throw new AppError("Not authorised to view this referral", 403);
    }
  } else {
    // A patient or guardian may view their own referral.
    await assertClinicalAccess(referral.patientId, actor);
  }

  const [fromDoctor, toDoctor, toDepartment, patient] = await Promise.all([
    prisma.doctor.findUnique({ where: { id: referral.fromDoctorId }, select: { fullName: true } }),
    referral.toDoctorId
      ? prisma.doctor.findUnique({ where: { id: referral.toDoctorId }, select: { fullName: true } })
      : null,
    referral.toDepartmentId
      ? prisma.department.findUnique({
          where: { id: referral.toDepartmentId },
          select: { name: true },
        })
      : null,
    prisma.patient.findUnique({
      where: { id: referral.patientId },
      select: { fullName: true, mrn: true },
    }),
  ]);

  return {
    ...referral,
    fromDoctorName: fromDoctor?.fullName ?? null,
    toDoctorName: toDoctor?.fullName ?? null,
    toDepartmentName: toDepartment?.name ?? null,
    patientName: patient?.fullName ?? null,
    patientMrn: patient?.mrn ?? null,
  };
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

  const referrals = await prisma.referral.findMany({
    where: { toDoctorId: doctor.id, ...(status ? { status: status as never } : {}) },
    orderBy: { createdAt: "desc" },
  });

  return withNames(referrals);
}

/** Referrals the calling doctor has made. */
export async function listOutgoing(actor: Actor) {
  const doctor = await requireDoctor(actor);

  const referrals = await prisma.referral.findMany({
    where: { fromDoctorId: doctor.id },
    orderBy: { createdAt: "desc" },
  });

  return withNames(referrals);
}

export async function listForPatient(patientId: string, actor: Actor) {
  await assertClinicalAccess(patientId, actor);

  const referrals = await prisma.referral.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
  });

  return withNames(referrals);
}

/** Resolves patient/doctor/department names onto referral rows for the card UI. */
async function withNames(referrals: Awaited<ReturnType<typeof prisma.referral.findMany>>) {
  if (referrals.length === 0) return [];

  const patientIds = [...new Set(referrals.map((r) => r.patientId))];
  const doctorIds = [
    ...new Set(referrals.flatMap((r) => [r.fromDoctorId, r.toDoctorId ?? ""].filter(Boolean))),
  ];
  const departmentIds = [...new Set(referrals.map((r) => r.toDepartmentId ?? "").filter(Boolean))];

  const [patients, doctors, departments] = await Promise.all([
    prisma.patient.findMany({
      where: { id: { in: patientIds } },
      select: { id: true, fullName: true, mrn: true },
    }),
    prisma.doctor.findMany({
      where: { id: { in: doctorIds } },
      select: { id: true, fullName: true },
    }),
    prisma.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true, name: true },
    }),
  ]);

  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const doctorMap = new Map(doctors.map((d) => [d.id, d]));
  const deptMap = new Map(departments.map((d) => [d.id, d]));

  return referrals.map((r) => ({
    ...r,
    patientName: patientMap.get(r.patientId)?.fullName ?? null,
    patientMrn: patientMap.get(r.patientId)?.mrn ?? null,
    fromDoctorName: doctorMap.get(r.fromDoctorId)?.fullName ?? null,
    toDoctorName: r.toDoctorId ? (doctorMap.get(r.toDoctorId)?.fullName ?? null) : null,
    toDepartmentName: r.toDepartmentId ? (deptMap.get(r.toDepartmentId)?.name ?? null) : null,
  }));
}
