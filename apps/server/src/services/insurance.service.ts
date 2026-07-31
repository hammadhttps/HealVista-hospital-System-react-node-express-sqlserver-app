import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import type { Actor } from "./bill.service.js";
import { getDependentPatientIds } from "./access.service.js";
import type { CreateInsuranceInput, UpdateInsuranceInput } from "@medicore/shared";

const INSURANCE_STAFF_ROLES = ["ACCOUNTANT", "RECEPTIONIST", "ADMIN"];

/** A patient may read their own policies; staff may read anyone's. */
async function assertCanAccessPatient(patientId: string, actor: Actor) {
  if (INSURANCE_STAFF_ROLES.includes(actor.role)) return;

  if (actor.role === "PATIENT") {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { userId: true },
    });
    if (patient?.userId === actor.userId) return;

    // A guardian manages their dependant's cover — a child's policy is almost always
    // held and administered by the parent.
    const self = await prisma.patient.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (self) {
      const dependents = await getDependentPatientIds(self.id, "booking");
      if (dependents.includes(patientId)) return;
    }
  }

  throw new AppError("Not authorised to access this patient's insurance", 403);
}

export async function listForPatient(patientId: string, actor: Actor) {
  await assertCanAccessPatient(patientId, actor);
  return prisma.patientInsurance.findMany({
    where: { patientId },
    orderBy: [{ isActive: "desc" }, { coveragePercentage: "desc" }],
  });
}

export async function createInsurance(input: CreateInsuranceInput, actor: Actor) {
  const patient = await prisma.patient.findUnique({ where: { id: input.patientId } });
  if (!patient) throw new AppError("Patient not found", 404);

  if (input.validUntil && new Date(input.validUntil) < new Date()) {
    throw new AppError("Cannot add a policy that has already expired", 400);
  }

  const insurance = await prisma.patientInsurance.create({
    data: {
      patientId: input.patientId,
      providerName: input.providerName,
      policyNumber: input.policyNumber,
      coveragePercentage: input.coveragePercentage,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      isActive: input.isActive,
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "INSURANCE_ADDED",
    targetType: "patient_insurance",
    targetId: insurance.id,
    metadata: {
      patientId: input.patientId,
      providerName: input.providerName,
      coveragePercentage: input.coveragePercentage,
    },
  });

  return insurance;
}

export async function updateInsurance(id: string, input: UpdateInsuranceInput, actor: Actor) {
  const existing = await prisma.patientInsurance.findUnique({ where: { id } });
  if (!existing) throw new AppError("Insurance policy not found", 404);
  await assertCanAccessPatient(existing.patientId, actor);

  const insurance = await prisma.patientInsurance.update({
    where: { id },
    data: {
      ...(input.providerName !== undefined && { providerName: input.providerName }),
      ...(input.policyNumber !== undefined && { policyNumber: input.policyNumber }),
      ...(input.coveragePercentage !== undefined && {
        coveragePercentage: input.coveragePercentage,
      }),
      ...(input.validUntil !== undefined && {
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
      }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "INSURANCE_UPDATED",
    targetType: "patient_insurance",
    targetId: id,
    metadata: { changes: Object.keys(input) },
  });

  return insurance;
}

export async function deactivateInsurance(id: string, actor: Actor) {
  const existing = await prisma.patientInsurance.findUnique({ where: { id } });
  if (!existing) throw new AppError("Insurance policy not found", 404);
  await assertCanAccessPatient(existing.patientId, actor);

  const insurance = await prisma.patientInsurance.update({
    where: { id },
    data: { isActive: false },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "INSURANCE_DEACTIVATED",
    targetType: "patient_insurance",
    targetId: id,
  });

  return insurance;
}
