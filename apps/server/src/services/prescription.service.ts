import PDFDocument from "pdfkit";
import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import { assertClinicalAccess, type Actor } from "./access.service.js";
import { checkPrescriptionSafety, type SafetyWarning } from "./prescriptionSafety.service.js";
import { scheduleFollowUpReminder } from "./notification.service.js";
import * as settingsService from "./settings.service.js";
import { addEmbeddingJob } from "../config/bull.js";

export interface PrescriptionItemInput {
  medicineId?: string;
  medicineName: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  quantityPrescribed?: number;
  instructions?: string;
}

async function requireDoctor(actor: Actor) {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: actor.userId },
    select: { id: true, fullName: true, licenseNumber: true },
  });
  if (!doctor) throw new AppError("Doctor record not found", 404);
  return doctor;
}

/** Dry run — lets the editor warn before the doctor commits to issuing. */
export async function checkSafety(appointmentId: string, medicines: string[], actor: Actor) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientId: true },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);
  await assertClinicalAccess(appointment.patientId, actor);

  return checkPrescriptionSafety(appointment.patientId, medicines);
}

/**
 * Issues or drafts a prescription.
 *
 * Safety is enforced here, not in the controller — a second caller (an import, a
 * script, a future AI-assisted draft) must not be able to route around it.
 */
export async function createPrescription(
  input: {
    appointmentId: string;
    items: PrescriptionItemInput[];
    notes?: string;
    isDraft?: boolean;
    followUpAfterDays?: number;
    /** Warnings the prescriber has explicitly accepted. */
    acknowledgedWarnings?: string[];
  },
  actor: Actor,
) {
  const doctor = await requireDoctor(actor);

  const appointment = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    select: { id: true, patientId: true, doctorId: true },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (appointment.doctorId !== doctor.id) {
    throw new AppError("You can only prescribe for your own appointments", 403);
  }
  if (input.items.length === 0) {
    throw new AppError("A prescription needs at least one item", 400);
  }

  const medicines = input.items.map((i) => i.medicineName);
  const report = await checkPrescriptionSafety(appointment.patientId, medicines);

  // A severe allergy match is an absolute contraindication — 409, no override.
  if (report.blocking.length > 0) {
    const detail = report.blocking
      .map((w) =>
        w.kind === "allergy"
          ? `${w.medicineName} conflicts with a SEVERE allergy to ${w.allergen}`
          : `${w.drugA} + ${w.drugB}: ${w.description}`,
      )
      .join("; ");
    throw new AppError(`Prescription blocked on patient safety grounds — ${detail}`, 409);
  }

  // Non-blocking warnings must be acknowledged explicitly. "The system warned them
  // and they proceeded" is precisely what a medico-legal review asks about, so the
  // acknowledgement is recorded, not merely displayed.
  const acknowledged = new Set(input.acknowledgedWarnings ?? []);
  const unacknowledged = report.acknowledgeable.filter((w) => !acknowledged.has(warningKey(w)));
  if (!input.isDraft && unacknowledged.length > 0) {
    throw new AppError(
      "This prescription has safety warnings that must be acknowledged before issuing",
      409,
    );
  }

  const prescription = await prisma.prescription.create({
    data: {
      appointmentId: input.appointmentId,
      notes: input.notes ?? null,
      isDraft: input.isDraft ?? false,
      followUpAfterDays: input.followUpAfterDays ?? null,
      items: {
        create: input.items.map((item) => ({
          medicineId: item.medicineId ?? null,
          medicineName: item.medicineName.trim(),
          dosage: item.dosage,
          frequency: item.frequency,
          durationDays: item.durationDays,
          quantityPrescribed: item.quantityPrescribed ?? 1,
          instructions: item.instructions ?? null,
        })),
      },
    },
    include: { items: true },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: input.isDraft ? "PRESCRIPTION_DRAFTED" : "PRESCRIPTION_ISSUED",
    targetType: "prescription",
    targetId: prescription.id,
    metadata: {
      patientId: appointment.patientId,
      appointmentId: input.appointmentId,
      medicines,
      // The record of what the prescriber was shown and accepted.
      warningsShown: report.warnings.map(warningKey),
      warningsAcknowledged: [...acknowledged],
    },
  });

  // `followUpAfterDays` on an issued prescription schedules the "time to book again"
  // nudge. Best-effort — a queue outage must never fail an issued prescription.
  if (!input.isDraft && input.followUpAfterDays && input.followUpAfterDays > 0) {
    try {
      await scheduleFollowUpReminder(input.appointmentId, input.followUpAfterDays);
    } catch (err) {
      console.error("[prescription] Failed to schedule follow-up reminder:", err);
    }
  }

  // An issued prescription is a RAG source. Best-effort — the backfill script
  // (`npm run db:embed`) catches anything the queue drops.
  if (!input.isDraft) {
    try {
      await addEmbeddingJob("prescription", prescription.id);
    } catch (err) {
      console.error("[prescription] Failed to enqueue embedding:", err);
    }
  }

  return { prescription, warnings: report.warnings };
}

/** Stable identifier for a warning, so an acknowledgement can be matched to it. */
export function warningKey(w: SafetyWarning): string {
  return w.kind === "allergy"
    ? `allergy:${w.medicineName}:${w.allergen}`
    : `interaction:${w.drugA}:${w.drugB}`;
}

export async function issueDraft(prescriptionId: string, acknowledged: string[], actor: Actor) {
  const doctor = await requireDoctor(actor);

  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: { items: true, appointment: { select: { patientId: true, doctorId: true } } },
  });
  if (!prescription) throw new AppError("Prescription not found", 404);
  if (prescription.appointment.doctorId !== doctor.id) {
    throw new AppError("You can only issue your own prescriptions", 403);
  }
  if (!prescription.isDraft) throw new AppError("This prescription is already issued", 409);

  // Re-check at issue time: allergies may have been recorded since the draft.
  const report = await checkPrescriptionSafety(
    prescription.appointment.patientId,
    prescription.items.map((i) => i.medicineName),
  );
  if (report.blocking.length > 0) {
    throw new AppError("Prescription blocked on patient safety grounds", 409);
  }

  const ackSet = new Set(acknowledged);
  if (report.acknowledgeable.some((w) => !ackSet.has(warningKey(w)))) {
    throw new AppError("Safety warnings must be acknowledged before issuing", 409);
  }

  const issued = await prisma.prescription.update({
    where: { id: prescriptionId },
    data: { isDraft: false },
    include: { items: true },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "PRESCRIPTION_ISSUED",
    targetType: "prescription",
    targetId: prescriptionId,
    metadata: {
      patientId: prescription.appointment.patientId,
      warningsAcknowledged: acknowledged,
    },
  });

  // A draft that carries a follow-up interval schedules the nudge when issued.
  if (prescription.followUpAfterDays && prescription.followUpAfterDays > 0) {
    try {
      await scheduleFollowUpReminder(prescription.appointmentId, prescription.followUpAfterDays);
    } catch (err) {
      console.error("[prescription] Failed to schedule follow-up reminder:", err);
    }
  }

  // The freshly issued prescription is a RAG source. Best-effort.
  try {
    await addEmbeddingJob("prescription", prescriptionId);
  } catch (err) {
    console.error("[prescription] Failed to enqueue embedding:", err);
  }

  return issued;
}

/**
 * The appointment's one prescription, when it is still a draft. Used to hydrate
 * the editor after an autosave or a page reload — `appointmentId` is unique, so
 * there is never more than one row per appointment.
 */
export async function getLatestDraftForAppointment(appointmentId: string, actor: Actor) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientId: true, doctorId: true },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);

  const doctor = await requireDoctor(actor);
  if (appointment.doctorId !== doctor.id) {
    throw new AppError("You can only load drafts for your own appointments", 403);
  }
  await assertClinicalAccess(appointment.patientId, actor);

  return prisma.prescription.findUnique({
    where: { appointmentId },
    include: { items: true },
  });
}

/**
 * Autosave: updates the appointment's draft in place.
 *
 * Safety is enforced exactly as on create — a draft never stores a medicine that
 * a severe allergy blocks, and the warnings a draft carries are re-checked at
 * issue time anyway. Items are replaced wholesale rather than diffed, which keeps
 * a doctor's medicine list a snapshot of the last successful save.
 */
export async function updateDraft(
  prescriptionId: string,
  input: {
    items: PrescriptionItemInput[];
    notes?: string;
    followUpAfterDays?: number;
  },
  actor: Actor,
) {
  const doctor = await requireDoctor(actor);

  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: { appointment: { select: { id: true, patientId: true, doctorId: true } } },
  });
  if (!prescription) throw new AppError("Prescription not found", 404);
  if (!prescription.isDraft) throw new AppError("Only drafts can be edited", 409);
  if (prescription.appointment.doctorId !== doctor.id) {
    throw new AppError("You can only edit your own prescriptions", 403);
  }
  if (input.items.length === 0) {
    throw new AppError("A prescription needs at least one item", 400);
  }

  const report = await checkPrescriptionSafety(
    prescription.appointment.patientId,
    input.items.map((i) => i.medicineName),
  );
  if (report.blocking.length > 0) {
    const detail = report.blocking
      .map((w) =>
        w.kind === "allergy"
          ? `${w.medicineName} conflicts with a SEVERE allergy to ${w.allergen}`
          : `${w.drugA} + ${w.drugB}: ${w.description}`,
      )
      .join("; ");
    throw new AppError(`Prescription blocked on patient safety grounds — ${detail}`, 409);
  }

  await prisma.prescriptionItem.deleteMany({ where: { prescriptionId } });

  const updated = await prisma.prescription.update({
    where: { id: prescriptionId },
    data: {
      notes: input.notes ?? null,
      followUpAfterDays: input.followUpAfterDays ?? null,
      items: {
        create: input.items.map((item) => ({
          medicineId: item.medicineId ?? null,
          medicineName: item.medicineName.trim(),
          dosage: item.dosage,
          frequency: item.frequency,
          durationDays: item.durationDays,
          quantityPrescribed: item.quantityPrescribed ?? 1,
          instructions: item.instructions ?? null,
        })),
      },
    },
    include: { items: true },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "PRESCRIPTION_DRAFT_UPDATED",
    targetType: "prescription",
    targetId: prescriptionId,
    metadata: {
      patientId: prescription.appointment.patientId,
      appointmentId: prescription.appointment.id,
      medicines: input.items.map((i) => i.medicineName),
    },
  });

  return updated;
}

export async function getPrescription(prescriptionId: string, actor: Actor) {
  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: {
      items: true,
      appointment: {
        select: {
          patientId: true,
          appointmentNo: true,
          patient: { select: { fullName: true, mrn: true, dateOfBirth: true } },
          doctor: { select: { fullName: true, licenseNumber: true } },
        },
      },
    },
  });
  if (!prescription) throw new AppError("Prescription not found", 404);
  await assertClinicalAccess(prescription.appointment.patientId, actor);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "PRESCRIPTION_VIEWED",
    targetType: "prescription",
    targetId: prescriptionId,
    metadata: { patientId: prescription.appointment.patientId },
  });

  return prescription;
}

export async function listForPatient(patientId: string, actor: Actor) {
  await assertClinicalAccess(patientId, actor);

  return prisma.prescription.findMany({
    where: { deletedAt: null, appointment: { patientId } },
    include: {
      items: true,
      appointment: {
        select: { appointmentNo: true, doctor: { select: { fullName: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ─── Favourite prescriptions ────────────────────────────────────────────────

export async function listFavourites(actor: Actor) {
  const doctor = await requireDoctor(actor);
  return prisma.favouritePrescription.findMany({
    where: { doctorId: doctor.id },
    orderBy: [{ useCount: "desc" }, { name: "asc" }],
  });
}

export async function saveFavourite(
  input: { name: string; items: PrescriptionItemInput[] },
  actor: Actor,
) {
  const doctor = await requireDoctor(actor);
  if (input.items.length === 0) {
    throw new AppError("A favourite needs at least one item", 400);
  }

  try {
    return await prisma.favouritePrescription.create({
      data: { doctorId: doctor.id, name: input.name.trim(), items: input.items as object },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new AppError("You already have a favourite with that name", 409);
    }
    throw err;
  }
}

/** Increments `useCount` so the picker can order by what the doctor actually uses. */
export async function applyFavourite(favouriteId: string, actor: Actor) {
  const doctor = await requireDoctor(actor);

  const favourite = await prisma.favouritePrescription.findUnique({ where: { id: favouriteId } });
  if (!favourite) throw new AppError("Favourite not found", 404);
  if (favourite.doctorId !== doctor.id) {
    throw new AppError("Not authorised to use this favourite", 403);
  }

  await prisma.favouritePrescription.update({
    where: { id: favouriteId },
    data: { useCount: { increment: 1 } },
  });

  return favourite.items;
}

export async function deleteFavourite(favouriteId: string, actor: Actor) {
  const doctor = await requireDoctor(actor);
  const favourite = await prisma.favouritePrescription.findUnique({ where: { id: favouriteId } });
  if (!favourite) throw new AppError("Favourite not found", 404);
  if (favourite.doctorId !== doctor.id) {
    throw new AppError("Not authorised to delete this favourite", 403);
  }
  await prisma.favouritePrescription.delete({ where: { id: favouriteId } });
}

// ─── PDF ────────────────────────────────────────────────────────────────────

export async function generatePrescriptionPdf(prescriptionId: string, actor: Actor) {
  const prescription = await getPrescription(prescriptionId, actor);
  const settings = (await settingsService.get()) as { name: string };

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  doc.fontSize(20).text(settings.name, { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(13).text("Prescription", { align: "center" });
  doc.moveDown(1.2);

  doc.fontSize(10);
  doc.text(`Patient:  ${prescription.appointment.patient.fullName}`);
  doc.text(`MRN:      ${prescription.appointment.patient.mrn}`);
  doc.text(`Doctor:   Dr. ${prescription.appointment.doctor.fullName}`);
  if (prescription.appointment.doctor.licenseNumber) {
    doc.text(`Licence:  ${prescription.appointment.doctor.licenseNumber}`);
  }
  doc.text(`Date:     ${prescription.createdAt.toISOString().slice(0, 10)}`);
  doc.moveDown(1);

  doc.fontSize(16).text("℞", 50, doc.y);
  doc.moveDown(0.5);
  doc.fontSize(10);

  prescription.items.forEach((item, index) => {
    doc.font("Helvetica-Bold").text(`${index + 1}. ${item.medicineName}`);
    doc
      .font("Helvetica")
      .text(
        `    ${item.dosage} · ${item.frequency} · ${item.durationDays} day(s)` +
          (item.quantityPrescribed ? ` · qty ${item.quantityPrescribed}` : ""),
      );
    if (item.instructions) doc.text(`    ${item.instructions}`);
    doc.moveDown(0.4);
  });

  if (prescription.notes) {
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").text("Notes");
    doc.font("Helvetica").text(prescription.notes);
  }

  doc.moveDown(3);
  doc.text("_______________________", { align: "right" });
  doc.text(`Dr. ${prescription.appointment.doctor.fullName}`, { align: "right" });

  doc.end();
  return { doc, filename: `prescription-${prescription.id.slice(0, 8)}.pdf` };
}
