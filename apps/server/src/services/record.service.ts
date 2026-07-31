import crypto from "crypto";
import cloudinary from "../config/cloudinary.js";
import { env } from "../config/env.js";
import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import {
  assertClinicalAccess,
  assertClinicalWriteAccess,
  resolveActingPatientId,
  type Actor,
} from "./access.service.js";

/**
 * Medical records — uploaded documents attached to a patient.
 *
 * **Delivery URLs are always signed and short-lived.** A public Cloudinary URL to a
 * lab report is a permanent, unauthenticated link to a patient's medical data; once it
 * leaks or gets indexed there is no revoking it. Nothing here ever stores or returns a
 * public URL — the database holds the storage `publicId`, and a URL is minted per
 * request, per authorised caller, with an expiry.
 *
 * Uploads go **direct from the browser to Cloudinary** using a signature this service
 * issues. Patient documents never transit our server, and the signature constrains
 * exactly where the file may land.
 */

/** How long a delivery URL stays valid. Long enough to open, short enough to be useless if shared. */
const SIGNED_URL_TTL_SECONDS = 300;

/** How long an upload signature stays valid. */
const UPLOAD_SIGNATURE_TTL_SECONDS = 600;

const ALLOWED_CATEGORIES = [
  "lab_report",
  "imaging",
  "prescription",
  "discharge_summary",
  "referral",
  "insurance",
  "other",
] as const;

export type RecordCategory = (typeof ALLOWED_CATEGORIES)[number];

const ALLOWED_FILE_TYPES = ["pdf", "jpg", "jpeg", "png", "webp", "heic"];

/**
 * Issues a signed, scoped upload authorisation.
 *
 * The folder is derived server-side from the patient id — the client cannot choose
 * where the file lands, so one patient's upload can never be written into another
 * patient's folder.
 */
/**
 * Cloudinary credentials are optional in env so the rest of the app boots without
 * them. Uploads must then fail loudly — signing with `undefined` would produce a
 * signature that looks valid and rejects at the point of upload, which reads as a
 * mysterious client bug rather than a missing secret.
 */
function requireCloudinaryConfig() {
  if (!env.CLOUDINARY_API_SECRET || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_CLOUD_NAME) {
    throw new AppError("File storage is not configured on this server", 503);
  }
  return {
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
  };
}

export async function createUploadSignature(
  input: { patientId: string; fileType: string },
  actor: Actor,
) {
  const config = requireCloudinaryConfig();
  await assertClinicalWriteAccess(input.patientId, actor);

  const fileType = input.fileType.toLowerCase().replace(/^\./, "");
  if (!ALLOWED_FILE_TYPES.includes(fileType)) {
    throw new AppError(
      `Unsupported file type "${fileType}". Allowed: ${ALLOWED_FILE_TYPES.join(", ")}`,
      400,
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `medicore/records/${input.patientId}`;
  const publicId = `${folder}/${crypto.randomUUID()}`;

  // `type: authenticated` is the part that matters: it makes the stored asset
  // unreachable without a signature, so even a leaked publicId is not a leaked file.
  const paramsToSign = {
    timestamp,
    public_id: publicId,
    type: "authenticated",
  };

  const signature = cloudinary.utils.api_sign_request(paramsToSign, config.apiSecret);

  return {
    signature,
    timestamp,
    publicId,
    apiKey: config.apiKey,
    cloudName: config.cloudName,
    type: "authenticated",
    expiresIn: UPLOAD_SIGNATURE_TTL_SECONDS,
  };
}

/**
 * Records an upload that has completed.
 *
 * The `publicId` is re-derived against the patient's folder rather than trusted, so a
 * caller cannot attach an arbitrary existing asset — including another patient's
 * document — to a record they can read.
 */
export async function registerRecord(
  input: {
    patientId: string;
    publicId: string;
    title: string;
    fileType: string;
    category?: string;
  },
  actor: Actor,
) {
  await assertClinicalWriteAccess(input.patientId, actor);

  const expectedPrefix = `medicore/records/${input.patientId}/`;
  if (!input.publicId.startsWith(expectedPrefix)) {
    throw new AppError("This upload does not belong to this patient", 400);
  }
  if (!input.title?.trim()) throw new AppError("A record needs a title", 400);
  if (input.category && !ALLOWED_CATEGORIES.includes(input.category as RecordCategory)) {
    throw new AppError(`Unknown category "${input.category}"`, 400);
  }

  const record = await prisma.medicalRecord.create({
    data: {
      patientId: input.patientId,
      // The column is named fileUrl for historical reasons but stores the storage
      // identifier, never a URL. A stored URL would outlive its signature and
      // eventually be handed out expired — or worse, unsigned.
      fileUrl: input.publicId,
      fileType: input.fileType.toLowerCase(),
      title: input.title.trim(),
      category: input.category ?? "other",
      uploadedById: actor.userId,
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "MEDICAL_RECORD_UPLOADED",
    targetType: "medical_record",
    targetId: record.id,
    metadata: { patientId: input.patientId, category: record.category },
  });

  return record;
}

/** Mints a short-lived signed delivery URL. Never persisted. */
export function signDeliveryUrl(publicId: string, fileType: string): string {
  return cloudinary.url(publicId, {
    type: "authenticated",
    sign_url: true,
    secure: true,
    resource_type: fileType === "pdf" ? "image" : "image",
    expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
  });
}

export async function listRecords(patientId: string, actor: Actor, category?: string) {
  await assertClinicalAccess(patientId, actor);

  const records = await prisma.medicalRecord.findMany({
    where: {
      patientId,
      deletedAt: null,
      ...(category ? { category } : {}),
    },
    orderBy: { uploadedAt: "desc" },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "MEDICAL_RECORDS_LISTED",
    targetType: "patient",
    targetId: patientId,
    metadata: { count: records.length },
  });

  // The list deliberately carries no URLs. Minting a signed URL per row would hand
  // out live links to documents the user has not asked to open, and every one of them
  // would be valid for the next five minutes.
  return records.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    fileType: r.fileType,
    uploadedAt: r.uploadedAt,
    uploadedById: r.uploadedById,
  }));
}

/** Returns a signed URL for one record. This is the audited "someone opened it" event. */
export async function getRecordUrl(recordId: string, actor: Actor) {
  const record = await prisma.medicalRecord.findUnique({ where: { id: recordId } });
  if (!record || record.deletedAt) throw new AppError("Record not found", 404);
  await assertClinicalAccess(record.patientId, actor);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "MEDICAL_RECORD_OPENED",
    targetType: "medical_record",
    targetId: recordId,
    metadata: { patientId: record.patientId, title: record.title },
  });

  return {
    url: signDeliveryUrl(record.fileUrl, record.fileType),
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    title: record.title,
    fileType: record.fileType,
  };
}

/** Soft delete — clinical records are never hard-deleted. */
export async function removeRecord(recordId: string, actor: Actor) {
  const record = await prisma.medicalRecord.findUnique({ where: { id: recordId } });
  if (!record || record.deletedAt) throw new AppError("Record not found", 404);
  await assertClinicalWriteAccess(record.patientId, actor);

  await prisma.medicalRecord.update({
    where: { id: recordId },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "MEDICAL_RECORD_DELETED",
    targetType: "medical_record",
    targetId: recordId,
    metadata: { patientId: record.patientId, title: record.title },
  });
}

/**
 * Health vault export — everything the hospital holds on a patient, in one document.
 *
 * Deliberately a *data* export rather than a bundle of files: file contents stay
 * behind signed URLs that expire. What the patient gets is the record of their care,
 * plus the identifiers needed to request each document individually.
 */
export async function exportHealthVault(
  actor: Actor,
  requestedPatientId?: string,
) {
  // A guardian may export a dependant's vault; nobody else may export anyone's.
  const patientId =
    actor.role === "PATIENT"
      ? await resolveActingPatientId(actor, requestedPatientId)
      : (requestedPatientId ?? "");

  if (!patientId) throw new AppError("A patient must be specified", 400);
  await assertClinicalAccess(patientId, actor);

  const [patient, allergies, conditions, vaccinations, surgeries, prescriptions, labOrders, notes, records, vitals] =
    await Promise.all([
      prisma.patient.findUnique({
        where: { id: patientId },
        select: {
          mrn: true,
          fullName: true,
          dateOfBirth: true,
          gender: true,
          bloodGroup: true,
        },
      }),
      prisma.patientAllergy.findMany({ where: { patientId } }),
      prisma.patientCondition.findMany({ where: { patientId } }),
      prisma.vaccination.findMany({ where: { patientId } }),
      prisma.surgicalHistory.findMany({ where: { patientId } }),
      prisma.prescription.findMany({
        where: { deletedAt: null, isDraft: false, appointment: { patientId } },
        include: { items: true },
      }),
      // Only verified results. An export is a document the patient keeps and shows to
      // other clinicians — an unverified value in it outlives every safeguard we put
      // around the screen it came from.
      prisma.labOrder.findMany({
        where: { patientId, status: "VERIFIED" },
        include: { items: { include: { labTest: { select: { name: true, code: true } } } } },
      }),
      prisma.consultationNote.findMany({
        where: { signedAt: { not: null }, appointment: { patientId, deletedAt: null } },
        include: { addenda: true },
      }),
      prisma.medicalRecord.findMany({
        where: { patientId, deletedAt: null },
        select: { id: true, title: true, category: true, fileType: true, uploadedAt: true },
      }),
      prisma.vitalReading.findMany({
        where: { patientId },
        orderBy: { recordedAt: "desc" },
        take: 500,
      }),
    ]);

  if (!patient) throw new AppError("Patient not found", 404);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "HEALTH_VAULT_EXPORTED",
    targetType: "patient",
    targetId: patientId,
    metadata: { records: records.length, prescriptions: prescriptions.length },
  });

  return {
    exportedAt: new Date().toISOString(),
    patient,
    allergies,
    conditions,
    vaccinations,
    surgeries,
    vitals,
    consultationNotes: notes,
    prescriptions,
    labOrders,
    // Identifiers only — each still needs an authorised, audited request to open.
    documents: records,
  };
}
