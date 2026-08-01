import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import { DELETION_GRACE_DAYS } from "@healvista/shared";
import { enqueueAnonymise, enqueueExport } from "../workers/compliance.worker.js";
import type {
  AuditLogEntry,
  AuditLogPage,
  AuditLogQueryInput,
  DataExportStatus,
  DeletionRequestStatus,
  PatientActivityEntry,
} from "@healvista/shared";

/**
 * Audit & compliance (Phase 6.4).
 *
 * Reads over the append-only audit trail, plus the two subject-rights flows.
 * Nothing here updates or deletes an audit row — the database rejects it anyway
 * (see `20260801120000_audit_logs_append_only`), and a correction is a *new*
 * row pointing at the one it corrects.
 */

const DEFAULT_PAGE_SIZE = 50;

/** Actions that constitute reading a patient's clinical record. */
const PATIENT_ACCESS_ACTIONS = [
  "MEDICAL_RECORD_OPENED",
  "MEDICAL_RECORDS_LISTED",
  "MEDICAL_RECORD_SUMMARY_VIEWED",
  "PATIENT_HISTORY_VIEWED",
  "NOTE_VIEWED",
  "NOTES_LISTED",
  "PRESCRIPTION_VIEWED",
  "LAB_ORDER_VIEWED",
  "HEALTH_VAULT_EXPORTED",
  "AI_RETRIEVAL",
];

function toEntry(row: {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  ipAddress: string | null;
  createdAt: Date;
  correctionOfId: string | null;
  metadata: Prisma.JsonValue;
  actor: { id: string; email: string; role: string } | null;
}): AuditLogEntry {
  return {
    id: row.id,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt.toISOString(),
    correctionOfId: row.correctionOfId,
    actor: row.actor,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

/** ADMIN: the audit trail, filterable by actor, action, target and date. */
export async function listAuditLogs(query: AuditLogQueryInput): Promise<AuditLogPage> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

  const where: Prisma.AuditLogWhereInput = {
    ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.targetType ? { targetType: query.targetType } : {}),
    ...(query.targetId ? { targetId: query.targetId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { actor: { select: { id: true, email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries: rows.map(toEntry), total, page, pageSize };
}

/**
 * Who accessed this patient's record, and when.
 *
 * The patient themselves may read their own timeline — that is the point of it —
 * and an admin may read anyone's. Nobody else, because the timeline reveals
 * which clinicians are involved in a person's care.
 */
export async function getPatientActivity(
  patientId: string,
  actor: { userId: string; role: string },
  limit = 100,
): Promise<PatientActivityEntry[]> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { userId: true },
  });
  if (!patient) throw new AppError("Patient not found", 404);

  const isSelf = patient.userId === actor.userId;
  if (!isSelf && actor.role !== "ADMIN") {
    throw new AppError("You cannot view this patient's access history", 403);
  }

  const rows = await prisma.auditLog.findMany({
    where: {
      targetId: patientId,
      action: { in: PATIENT_ACCESS_ACTIONS },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { id: true, email: true, role: true } } },
  });

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    createdAt: r.createdAt.toISOString(),
    actor: r.actor,
  }));
}

/**
 * Queues a full data export. Returns immediately with a pending request — the
 * worker builds the archive and attaches a time-limited signed URL.
 *
 * An in-flight request is returned rather than duplicated, so double-clicking
 * "export" does not queue two expensive jobs.
 */
export async function requestExport(
  userId: string,
  ipAddress?: string | null,
): Promise<DataExportStatus> {
  const existing = await prisma.dataExportRequest.findFirst({
    where: { userId, status: { in: ["pending", "processing"] } },
    orderBy: { requestedAt: "desc" },
  });
  if (existing) return toExportStatus(existing);

  const request = await prisma.dataExportRequest.create({
    data: { userId, status: "pending" },
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "DATA_EXPORT_REQUESTED",
    targetType: "User",
    targetId: userId,
    ipAddress,
    metadata: { requestId: request.id },
  });

  await enqueueExport(request.id);

  return toExportStatus(request);
}

export async function getExportStatus(userId: string): Promise<DataExportStatus | null> {
  const request = await prisma.dataExportRequest.findFirst({
    where: { userId },
    orderBy: { requestedAt: "desc" },
  });
  if (!request) return null;

  // A signed URL is time-limited; once past its expiry it is not offered again.
  if (request.expiresAt && request.expiresAt < new Date()) {
    return { ...toExportStatus(request), fileUrl: null };
  }
  return toExportStatus(request);
}

function toExportStatus(row: {
  id: string;
  status: string;
  fileUrl: string | null;
  expiresAt: Date | null;
  requestedAt: Date;
}): DataExportStatus {
  return {
    id: row.id,
    status: row.status as DataExportStatus["status"],
    fileUrl: row.fileUrl,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.requestedAt.toISOString(),
  };
}

/**
 * Schedules account deletion after a grace period.
 *
 * Deletion **anonymises**; it does not erase. Clinical and financial records
 * must survive for the hospital's own legal retention, and audit logs are
 * append-only by construction. What goes is the identity attached to them.
 *
 * Requires the current password: a stolen session must not be able to start a
 * 30-day countdown on someone's account.
 */
export async function requestDeletion(
  userId: string,
  password: string,
  ipAddress?: string | null,
): Promise<DeletionRequestStatus> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError("Password is incorrect", 401);
  }

  // Staff accounts are deactivated by an admin, not self-deleted — a clinician
  // removing their own identity from signed notes is not theirs to do.
  if (user.role !== "PATIENT") {
    throw new AppError("Staff accounts are closed by an administrator", 403);
  }

  const scheduledFor = new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);

  const request = await prisma.accountDeletionRequest.upsert({
    where: { userId },
    create: { userId, scheduledFor },
    update: { scheduledFor, cancelledAt: null },
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "ACCOUNT_DELETION_REQUESTED",
    targetType: "User",
    targetId: userId,
    ipAddress,
    metadata: { scheduledFor: scheduledFor.toISOString(), graceDays: DELETION_GRACE_DAYS },
  });

  // The job re-checks for cancellation when it fires, so a cancelled request is
  // safe even though the delayed job still exists.
  await enqueueAnonymise(userId, scheduledFor);

  return toDeletionStatus(request);
}

export async function cancelDeletion(
  userId: string,
  ipAddress?: string | null,
): Promise<DeletionRequestStatus> {
  const existing = await prisma.accountDeletionRequest.findUnique({ where: { userId } });
  if (!existing || existing.cancelledAt || existing.completedAt) {
    throw new AppError("No pending deletion request", 404);
  }

  const request = await prisma.accountDeletionRequest.update({
    where: { userId },
    data: { cancelledAt: new Date() },
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "ACCOUNT_DELETION_CANCELLED",
    targetType: "User",
    targetId: userId,
    ipAddress,
  });

  return toDeletionStatus(request);
}

export async function getDeletionStatus(userId: string): Promise<DeletionRequestStatus | null> {
  const request = await prisma.accountDeletionRequest.findUnique({ where: { userId } });
  return request ? toDeletionStatus(request) : null;
}

function toDeletionStatus(row: {
  id: string;
  scheduledFor: Date;
  cancelledAt: Date | null;
  completedAt: Date | null;
}): DeletionRequestStatus {
  return {
    id: row.id,
    scheduledFor: row.scheduledFor.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/**
 * Anonymises a due account. Called by the scheduled worker once the grace period
 * has passed, never from a request path.
 *
 * Identity is replaced in place: the patient row keeps its id, so appointments,
 * bills, prescriptions and lab results stay linked and the hospital's clinical
 * and financial history remains intact and correct. Audit rows are untouched —
 * they are append-only, and they are the record of this very operation.
 */
export async function anonymiseAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { patient: { select: { id: true } } },
  });
  if (!user) return;

  const anonymousEmail = `deleted-${userId}@anonymised.invalid`;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        email: anonymousEmail,
        phone: null,
        passwordHash: null,
        avatarUrl: null,
        isActive: false,
        deletedAt: new Date(),
      },
    });

    if (user.patient) {
      await tx.patient.update({
        where: { id: user.patient.id },
        data: {
          fullName: "Deleted patient",
          addressLine1: null,
          city: null,
          occupation: null,
          deletedAt: new Date(),
        },
      });
      await tx.emergencyContact.deleteMany({ where: { patientId: user.patient.id } });
    }

    await tx.userSession.deleteMany({ where: { userId } });
    await tx.searchHistory.deleteMany({ where: { userId } });
    await tx.savedSearch.deleteMany({ where: { userId } });

    await tx.accountDeletionRequest.update({
      where: { userId },
      data: { completedAt: new Date() },
    });
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "ACCOUNT_ANONYMISED",
    targetType: "User",
    targetId: userId,
    metadata: { patientId: user.patient?.id ?? null },
  });
}
