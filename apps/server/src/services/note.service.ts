import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import { assertClinicalAccess, type Actor } from "./access.service.js";

/**
 * Consultation notes (SOAP).
 *
 * The governing rule: **a signed note locks 24 hours later, and after that it is
 * never updated again.** Corrections become addenda carrying their own author and
 * timestamp. A clinical note that can be silently edited afterwards is worthless as
 * a record — the whole point of it is that it says what was known at the time.
 *
 * The 24-hour window exists because signing is often the last action of a busy
 * clinic and typos are caught the next morning. Beyond that, the note has been
 * relied on: billed against, referred from, dispensed from.
 */

export const LOCK_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface NoteInput {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  diagnosisCodes?: string[];
  aiAssisted?: boolean;
}

async function requireDoctor(actor: Actor) {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: actor.userId },
    select: { id: true, fullName: true },
  });
  if (!doctor) throw new AppError("Doctor record not found", 404);
  return doctor;
}

/**
 * Only the treating doctor writes the note.
 *
 * `assertClinicalAccess` is deliberately not enough here — it admits a referred
 * doctor and an admin, neither of whom authored this consultation.
 */
async function assertIsTreatingDoctor(appointmentId: string, actor: Actor) {
  const doctor = await requireDoctor(actor);
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, patientId: true, doctorId: true, status: true },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);
  if (appointment.doctorId !== doctor.id) {
    throw new AppError("Only the treating doctor may write this consultation note", 403);
  }
  return { appointment, doctor };
}

/** Whether a note may still be edited in place, or has passed into addendum-only. */
export function isLocked(note: { signedAt: Date | null; lockedAt: Date | null }): boolean {
  if (!note.signedAt) return false;
  const lockAt = note.lockedAt ?? new Date(note.signedAt.getTime() + LOCK_WINDOW_MS);
  return Date.now() >= lockAt.getTime();
}

/**
 * Creates or updates the note for an appointment. Doubles as the autosave endpoint —
 * the client can call this on a debounce and the note stays a draft until signed.
 */
export async function upsertNote(appointmentId: string, input: NoteInput, actor: Actor) {
  const { appointment } = await assertIsTreatingDoctor(appointmentId, actor);

  const existing = await prisma.consultationNote.findUnique({
    where: { appointmentId },
  });

  if (existing && isLocked(existing)) {
    throw new AppError(
      "This note is locked. Add an addendum instead — a signed note is not edited after 24 hours.",
      409,
    );
  }

  const note = existing
    ? await prisma.consultationNote.update({
        where: { appointmentId },
        data: {
          subjective: input.subjective ?? existing.subjective,
          objective: input.objective ?? existing.objective,
          assessment: input.assessment ?? existing.assessment,
          plan: input.plan ?? existing.plan,
          diagnosisCodes: input.diagnosisCodes ?? existing.diagnosisCodes,
          aiAssisted: input.aiAssisted ?? existing.aiAssisted,
        },
      })
    : await prisma.consultationNote.create({
        data: {
          appointmentId,
          authorUserId: actor.userId,
          subjective: input.subjective ?? "",
          objective: input.objective ?? "",
          assessment: input.assessment ?? "",
          plan: input.plan ?? "",
          diagnosisCodes: input.diagnosisCodes ?? [],
          aiAssisted: input.aiAssisted ?? false,
          isDraft: true,
        },
      });

  // Autosaves are frequent; auditing every keystroke-batch would bury the events that
  // matter. Only the first write and post-signature corrections are recorded.
  if (!existing || existing.signedAt) {
    await writeAuditLog({
      actorUserId: actor.userId,
      action: existing?.signedAt ? "NOTE_AMENDED_IN_WINDOW" : "NOTE_STARTED",
      targetType: "consultation_note",
      targetId: note.id,
      metadata: { patientId: appointment.patientId, appointmentId },
    });
  }

  return note;
}

/**
 * Signs the note. This is the clinically meaningful action — it asserts the content
 * is the doctor's own account of the consultation.
 */
export async function signNote(appointmentId: string, actor: Actor) {
  const { appointment } = await assertIsTreatingDoctor(appointmentId, actor);

  const note = await prisma.consultationNote.findUnique({ where: { appointmentId } });
  if (!note) throw new AppError("There is no note to sign", 404);
  if (note.signedAt) throw new AppError("This note is already signed", 409);

  // A note of four empty strings is not a record. Assessment and plan are the parts a
  // later reader actually relies on.
  if (!note.assessment.trim() || !note.plan.trim()) {
    throw new AppError("Assessment and plan are required before signing", 400);
  }

  const signedAt = new Date();
  const signed = await prisma.consultationNote.update({
    where: { appointmentId },
    data: {
      isDraft: false,
      signedAt,
      lockedAt: new Date(signedAt.getTime() + LOCK_WINDOW_MS),
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "NOTE_SIGNED",
    targetType: "consultation_note",
    targetId: note.id,
    metadata: { patientId: appointment.patientId, appointmentId, lockedAt: signed.lockedAt },
  });

  return signed;
}

/**
 * Adds an addendum. This is the *only* way to change what a locked note says, and it
 * appends rather than overwrites — the original text stays exactly as signed.
 */
export async function addAddendum(appointmentId: string, content: string, actor: Actor) {
  const { appointment } = await assertIsTreatingDoctor(appointmentId, actor);

  const note = await prisma.consultationNote.findUnique({ where: { appointmentId } });
  if (!note) throw new AppError("Note not found", 404);
  if (!note.signedAt) {
    throw new AppError("An unsigned note is edited directly, not by addendum", 400);
  }
  if (!content.trim()) throw new AppError("An addendum needs content", 400);

  const addendum = await prisma.noteAddendum.create({
    data: { noteId: note.id, authorUserId: actor.userId, content: content.trim() },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "NOTE_ADDENDUM_ADDED",
    targetType: "consultation_note",
    targetId: note.id,
    metadata: { patientId: appointment.patientId, appointmentId, addendumId: addendum.id },
  });

  return addendum;
}

export async function getNote(appointmentId: string, actor: Actor) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientId: true },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);
  await assertClinicalAccess(appointment.patientId, actor);

  const note = await prisma.consultationNote.findUnique({
    where: { appointmentId },
    include: { addenda: { orderBy: { createdAt: "asc" } } },
  });
  if (!note) return null;

  // An unsigned note is a work in progress, not a clinical record. Showing a patient
  // a half-written assessment they then act on is a harm the doctor never intended.
  if (!note.signedAt && actor.role === "PATIENT") return null;

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "NOTE_VIEWED",
    targetType: "consultation_note",
    targetId: note.id,
    metadata: { patientId: appointment.patientId, appointmentId },
  });

  return { ...note, locked: isLocked(note) };
}

/**
 * The patient's signed notes, newest first — the "what did we say last time" view a
 * doctor opens before a follow-up, and the source of the previous-visit comparison.
 */
export async function listPatientNotes(patientId: string, actor: Actor, limit = 20) {
  await assertClinicalAccess(patientId, actor);

  const notes = await prisma.consultationNote.findMany({
    where: {
      signedAt: { not: null },
      appointment: { patientId, deletedAt: null },
    },
    include: {
      addenda: { orderBy: { createdAt: "asc" } },
      appointment: {
        select: {
          id: true,
          appointmentNo: true,
          slot: { select: { startTime: true } },
          doctor: { select: { fullName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return notes.map((n) => ({ ...n, locked: isLocked(n) }));
}

/**
 * The note from the visit immediately before this one, so the consultation screen can
 * show "last time" beside "today" without the doctor going to look for it.
 */
export async function getPreviousNote(appointmentId: string, actor: Actor) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientId: true, slot: { select: { startTime: true } } },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);
  await assertClinicalAccess(appointment.patientId, actor);

  // "Previous" is by appointment time, not by note creation time — a note written up
  // late would otherwise sort as the most recent visit.
  return prisma.consultationNote.findFirst({
    where: {
      signedAt: { not: null },
      appointment: {
        patientId: appointment.patientId,
        slot: { startTime: { lt: appointment.slot.startTime } },
        deletedAt: null,
      },
    },
    include: {
      addenda: { orderBy: { createdAt: "asc" } },
      appointment: {
        select: {
          slot: { select: { startTime: true } },
          doctor: { select: { fullName: true } },
        },
      },
    },
    orderBy: { appointment: { slot: { startTime: "desc" } } },
  });
}

// ─── Templates ──────────────────────────────────────────────────────────────

export async function listTemplates(actor: Actor) {
  const doctor = await requireDoctor(actor);
  return prisma.noteTemplate.findMany({
    where: { doctorId: doctor.id },
    orderBy: { name: "asc" },
  });
}

export async function saveTemplate(
  input: { name: string } & NoteInput,
  actor: Actor,
) {
  const doctor = await requireDoctor(actor);
  if (!input.name?.trim()) throw new AppError("A template needs a name", 400);

  try {
    return await prisma.noteTemplate.create({
      data: {
        doctorId: doctor.id,
        name: input.name.trim(),
        subjective: input.subjective ?? null,
        objective: input.objective ?? null,
        assessment: input.assessment ?? null,
        plan: input.plan ?? null,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new AppError("You already have a template with that name", 409);
    }
    throw err;
  }
}

export async function deleteTemplate(templateId: string, actor: Actor) {
  const doctor = await requireDoctor(actor);
  const template = await prisma.noteTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new AppError("Template not found", 404);
  if (template.doctorId !== doctor.id) {
    throw new AppError("Not authorised to delete this template", 403);
  }
  await prisma.noteTemplate.delete({ where: { id: templateId } });
}

/**
 * Whether an appointment may be marked COMPLETED. Called by appointment.service —
 * the rule belongs to the note, so it lives here.
 */
export async function assertNoteSignedForCompletion(appointmentId: string) {
  const note = await prisma.consultationNote.findUnique({
    where: { appointmentId },
    select: { signedAt: true },
  });
  if (!note || !note.signedAt) {
    throw new AppError(
      "Sign the consultation note before completing this appointment",
      409,
    );
  }
}
