import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import { assertClinicalAccess, assertClinicalWriteAccess, type Actor } from "./access.service.js";

/**
 * Patient medical history — allergies, conditions, vaccinations, surgeries, family
 * history, lifestyle.
 *
 * Every read of this data writes an audit row: it is the clinical record, and
 * "who looked at this and when" is exactly what a medico-legal review asks for.
 */

// ─── Allergies ──────────────────────────────────────────────────────────────

export async function listAllergies(patientId: string, actor: Actor) {
  await assertClinicalAccess(patientId, actor);
  return prisma.patientAllergy.findMany({
    where: { patientId },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
  });
}

export async function addAllergy(
  patientId: string,
  input: { allergen: string; severity: "MILD" | "MODERATE" | "SEVERE"; reaction?: string },
  actor: Actor,
) {
  await assertClinicalWriteAccess(patientId, actor);

  const allergy = await prisma.patientAllergy.create({
    data: {
      patientId,
      allergen: input.allergen.trim(),
      severity: input.severity,
      reaction: input.reaction ?? null,
      // A clinician recording an allergy confirms it; a patient self-report does not.
      confirmedAt: actor.role === "DOCTOR" ? new Date() : null,
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "ALLERGY_ADDED",
    targetType: "patient_allergy",
    targetId: allergy.id,
    metadata: { patientId, allergen: input.allergen, severity: input.severity },
  });

  return allergy;
}

export async function confirmAllergy(allergyId: string, actor: Actor) {
  const allergy = await prisma.patientAllergy.findUnique({ where: { id: allergyId } });
  if (!allergy) throw new AppError("Allergy not found", 404);
  await assertClinicalWriteAccess(allergy.patientId, actor);

  if (actor.role !== "DOCTOR" && actor.role !== "ADMIN") {
    throw new AppError("Only a clinician can confirm an allergy", 403);
  }

  const updated = await prisma.patientAllergy.update({
    where: { id: allergyId },
    data: { confirmedAt: new Date() },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "ALLERGY_CONFIRMED",
    targetType: "patient_allergy",
    targetId: allergyId,
    metadata: { patientId: allergy.patientId },
  });

  return updated;
}

export async function removeAllergy(allergyId: string, actor: Actor) {
  const allergy = await prisma.patientAllergy.findUnique({ where: { id: allergyId } });
  if (!allergy) throw new AppError("Allergy not found", 404);
  await assertClinicalWriteAccess(allergy.patientId, actor);

  await prisma.patientAllergy.delete({ where: { id: allergyId } });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "ALLERGY_REMOVED",
    targetType: "patient_allergy",
    targetId: allergyId,
    metadata: { patientId: allergy.patientId, allergen: allergy.allergen },
  });
}

// ─── Conditions ─────────────────────────────────────────────────────────────

export async function listConditions(patientId: string, actor: Actor) {
  await assertClinicalAccess(patientId, actor);
  return prisma.patientCondition.findMany({
    where: { patientId },
    orderBy: [{ isActive: "desc" }, { diagnosedAt: "desc" }],
  });
}

export async function addCondition(
  patientId: string,
  input: { condition: string; diagnosedAt?: string; notes?: string },
  actor: Actor,
) {
  await assertClinicalWriteAccess(patientId, actor);

  const condition = await prisma.patientCondition.create({
    data: {
      patientId,
      condition: input.condition.trim(),
      diagnosedAt: input.diagnosedAt ? new Date(input.diagnosedAt) : null,
      notes: input.notes ?? null,
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "CONDITION_ADDED",
    targetType: "patient_condition",
    targetId: condition.id,
    metadata: { patientId, condition: input.condition },
  });

  return condition;
}

export async function resolveCondition(conditionId: string, actor: Actor) {
  const existing = await prisma.patientCondition.findUnique({ where: { id: conditionId } });
  if (!existing) throw new AppError("Condition not found", 404);
  await assertClinicalWriteAccess(existing.patientId, actor);

  const updated = await prisma.patientCondition.update({
    where: { id: conditionId },
    data: { isActive: false },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "CONDITION_RESOLVED",
    targetType: "patient_condition",
    targetId: conditionId,
    metadata: { patientId: existing.patientId },
  });

  return updated;
}

// ─── Vaccinations ───────────────────────────────────────────────────────────

export async function listVaccinations(patientId: string, actor: Actor) {
  await assertClinicalAccess(patientId, actor);
  return prisma.vaccination.findMany({
    where: { patientId },
    orderBy: { administeredAt: "desc" },
  });
}

export async function addVaccination(
  patientId: string,
  input: {
    vaccineName: string;
    doseNumber?: number;
    administeredAt: string;
    administeredBy?: string;
    batchNumber?: string;
    nextDueAt?: string;
  },
  actor: Actor,
) {
  await assertClinicalWriteAccess(patientId, actor);

  const vaccination = await prisma.vaccination.create({
    data: {
      patientId,
      vaccineName: input.vaccineName.trim(),
      doseNumber: input.doseNumber ?? null,
      administeredAt: new Date(input.administeredAt),
      administeredBy: input.administeredBy ?? null,
      batchNumber: input.batchNumber ?? null,
      nextDueAt: input.nextDueAt ? new Date(input.nextDueAt) : null,
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "VACCINATION_ADDED",
    targetType: "vaccination",
    targetId: vaccination.id,
    metadata: { patientId, vaccineName: input.vaccineName },
  });

  return vaccination;
}

// ─── Surgical history ───────────────────────────────────────────────────────

export async function listSurgeries(patientId: string, actor: Actor) {
  await assertClinicalAccess(patientId, actor);
  return prisma.surgicalHistory.findMany({
    where: { patientId },
    orderBy: { performedAt: "desc" },
  });
}

export async function addSurgery(
  patientId: string,
  input: {
    procedure: string;
    performedAt?: string;
    hospital?: string;
    surgeon?: string;
    notes?: string;
  },
  actor: Actor,
) {
  await assertClinicalWriteAccess(patientId, actor);

  const surgery = await prisma.surgicalHistory.create({
    data: {
      patientId,
      procedure: input.procedure.trim(),
      performedAt: input.performedAt ? new Date(input.performedAt) : null,
      hospital: input.hospital ?? null,
      surgeon: input.surgeon ?? null,
      notes: input.notes ?? null,
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "SURGERY_ADDED",
    targetType: "surgical_history",
    targetId: surgery.id,
    metadata: { patientId, procedure: input.procedure },
  });

  return surgery;
}

// ─── Family history ─────────────────────────────────────────────────────────

export async function listFamilyHistory(patientId: string, actor: Actor) {
  await assertClinicalAccess(patientId, actor);
  return prisma.familyHistory.findMany({ where: { patientId } });
}

export async function addFamilyHistory(
  patientId: string,
  input: { relationship: string; condition: string; notes?: string },
  actor: Actor,
) {
  await assertClinicalWriteAccess(patientId, actor);

  const entry = await prisma.familyHistory.create({
    data: {
      patientId,
      relationship: input.relationship.trim(),
      condition: input.condition.trim(),
      notes: input.notes ?? null,
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "FAMILY_HISTORY_ADDED",
    targetType: "family_history",
    targetId: entry.id,
    metadata: { patientId, condition: input.condition },
  });

  return entry;
}

// ─── Lifestyle ──────────────────────────────────────────────────────────────

export async function getLifestyle(patientId: string, actor: Actor) {
  await assertClinicalAccess(patientId, actor);
  return prisma.lifestyleProfile.findUnique({ where: { patientId } });
}

export async function upsertLifestyle(
  patientId: string,
  input: {
    smokingStatus?: string;
    alcoholUse?: string;
    exerciseFreq?: string;
    dietNotes?: string;
  },
  actor: Actor,
) {
  await assertClinicalWriteAccess(patientId, actor);

  const profile = await prisma.lifestyleProfile.upsert({
    where: { patientId },
    create: { patientId, ...input },
    update: input,
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "LIFESTYLE_UPDATED",
    targetType: "lifestyle_profile",
    targetId: profile.id,
    metadata: { patientId },
  });

  return profile;
}

// ─── Aggregated clinical summary ────────────────────────────────────────────

/**
 * One call for the whole clinical picture — what a doctor opens at the start of a
 * consultation. Fetched in parallel; a serial waterfall here is felt on every visit.
 */
export async function getPatientHistory(patientId: string, actor: Actor) {
  await assertClinicalAccess(patientId, actor);

  const [
    patient,
    allergies,
    conditions,
    vaccinations,
    surgeries,
    familyHistory,
    lifestyle,
    latestVitals,
  ] = await Promise.all([
    prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        fullName: true,
        mrn: true,
        dateOfBirth: true,
        gender: true,
        bloodGroup: true,
        isOrganDonor: true,
      },
    }),
    prisma.patientAllergy.findMany({
      where: { patientId },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    }),
    prisma.patientCondition.findMany({
      where: { patientId },
      orderBy: [{ isActive: "desc" }, { diagnosedAt: "desc" }],
    }),
    prisma.vaccination.findMany({ where: { patientId }, orderBy: { administeredAt: "desc" } }),
    prisma.surgicalHistory.findMany({ where: { patientId }, orderBy: { performedAt: "desc" } }),
    prisma.familyHistory.findMany({ where: { patientId } }),
    prisma.lifestyleProfile.findUnique({ where: { patientId } }),
    prisma.vitalReading.findMany({
      where: { patientId },
      orderBy: { recordedAt: "desc" },
      take: 20,
    }),
  ]);

  if (!patient) throw new AppError("Patient not found", 404);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "PATIENT_HISTORY_VIEWED",
    targetType: "patient",
    targetId: patientId,
  });

  return {
    patient,
    // Surfaced separately so the client can render the allergy banner without
    // scanning the list — a missed severe allergy is a patient-safety event.
    severeAllergies: allergies.filter((a) => a.severity === "SEVERE"),
    allergies,
    conditions,
    vaccinations,
    upcomingVaccinations: vaccinations.filter(
      (v) => v.nextDueAt && v.nextDueAt >= new Date(),
    ),
    surgeries,
    familyHistory,
    lifestyle,
    latestVitals,
  };
}
