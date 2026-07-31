import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import type { Actor } from "./access.service.js";

/**
 * Guardian ↔ dependant relationships.
 *
 * A dependant is a **real Patient row** with its own MRN and its own records — not a
 * sub-profile. That is what lets a child keep their history when they grow up and
 * the relationship is removed.
 */

async function requireOwnPatient(actor: Actor) {
  const patient = await prisma.patient.findUnique({
    where: { userId: actor.userId },
    select: { id: true, fullName: true },
  });
  if (!patient) throw new AppError("Patient record not found", 404);
  return patient;
}

export async function listDependents(actor: Actor) {
  const guardian = await requireOwnPatient(actor);

  const links = await prisma.patientRelationship.findMany({
    where: { guardianPatientId: guardian.id },
    include: {
      dependent: {
        select: { id: true, fullName: true, mrn: true, dateOfBirth: true, gender: true },
      },
    },
  });

  return links.map((link) => ({
    relationshipId: link.id,
    relationship: link.relationship,
    canBookAppointments: link.canBookAppointments,
    canViewRecords: link.canViewRecords,
    patient: link.dependent,
  }));
}

/** The guardians acting for the caller — shown so a patient can see who has access. */
export async function listGuardians(actor: Actor) {
  const patient = await requireOwnPatient(actor);

  const links = await prisma.patientRelationship.findMany({
    where: { dependentPatientId: patient.id },
    include: { guardian: { select: { id: true, fullName: true, mrn: true } } },
  });

  return links.map((link) => ({
    relationshipId: link.id,
    relationship: link.relationship,
    canBookAppointments: link.canBookAppointments,
    canViewRecords: link.canViewRecords,
    guardian: link.guardian,
  }));
}

/**
 * Links an existing patient as a dependant.
 *
 * Deliberately requires the dependant's MRN rather than accepting a patient id: an
 * id is guessable from a URL, an MRN has to be handed over. This is the control that
 * stops someone attaching a stranger's record to their own account.
 */
export async function addDependent(
  input: {
    dependentMrn: string;
    relationship: string;
    canBookAppointments?: boolean;
    canViewRecords?: boolean;
  },
  actor: Actor,
) {
  const guardian = await requireOwnPatient(actor);

  const dependent = await prisma.patient.findUnique({
    where: { mrn: input.dependentMrn.trim() },
    select: { id: true, fullName: true, mrn: true },
  });
  if (!dependent) throw new AppError("No patient found with that MRN", 404);
  if (dependent.id === guardian.id) {
    throw new AppError("You cannot add yourself as your own dependant", 400);
  }

  // Reject a cycle: if the "dependant" is already this patient's guardian, linking
  // back would give each unbounded access to the other.
  const inverse = await prisma.patientRelationship.findUnique({
    where: {
      guardianPatientId_dependentPatientId: {
        guardianPatientId: dependent.id,
        dependentPatientId: guardian.id,
      },
    },
  });
  if (inverse) {
    throw new AppError("That patient is already your guardian", 409);
  }

  try {
    const link = await prisma.patientRelationship.create({
      data: {
        guardianPatientId: guardian.id,
        dependentPatientId: dependent.id,
        relationship: input.relationship.trim(),
        canBookAppointments: input.canBookAppointments ?? true,
        canViewRecords: input.canViewRecords ?? true,
      },
    });

    await writeAuditLog({
      actorUserId: actor.userId,
      action: "DEPENDENT_LINKED",
      targetType: "patient_relationship",
      targetId: link.id,
      metadata: {
        guardianPatientId: guardian.id,
        dependentPatientId: dependent.id,
        relationship: input.relationship,
      },
    });

    return { ...link, dependent };
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new AppError("That patient is already one of your dependants", 409);
    }
    throw err;
  }
}

export async function updateDependentPermissions(
  relationshipId: string,
  input: { canBookAppointments?: boolean; canViewRecords?: boolean },
  actor: Actor,
) {
  const guardian = await requireOwnPatient(actor);

  const link = await prisma.patientRelationship.findUnique({ where: { id: relationshipId } });
  if (!link) throw new AppError("Relationship not found", 404);
  if (link.guardianPatientId !== guardian.id) {
    throw new AppError("Not authorised to change this relationship", 403);
  }

  const updated = await prisma.patientRelationship.update({
    where: { id: relationshipId },
    data: input,
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "DEPENDENT_PERMISSIONS_CHANGED",
    targetType: "patient_relationship",
    targetId: relationshipId,
    metadata: { ...input },
  });

  return updated;
}

/**
 * Unlinks a dependant. Either side may break the link — a guardian who no longer
 * needs access, or a dependant revoking it.
 */
export async function removeDependent(relationshipId: string, actor: Actor) {
  const patient = await requireOwnPatient(actor);

  const link = await prisma.patientRelationship.findUnique({ where: { id: relationshipId } });
  if (!link) throw new AppError("Relationship not found", 404);

  const isGuardian = link.guardianPatientId === patient.id;
  const isDependent = link.dependentPatientId === patient.id;
  if (!isGuardian && !isDependent && actor.role !== "ADMIN") {
    throw new AppError("Not authorised to remove this relationship", 403);
  }

  await prisma.patientRelationship.delete({ where: { id: relationshipId } });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "DEPENDENT_UNLINKED",
    targetType: "patient_relationship",
    targetId: relationshipId,
    metadata: {
      guardianPatientId: link.guardianPatientId,
      dependentPatientId: link.dependentPatientId,
      removedBy: isGuardian ? "guardian" : "dependent",
    },
  });
}
