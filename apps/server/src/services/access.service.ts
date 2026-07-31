import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";

/** The caller identity every scoped clinical read/write needs. Mirrors `JwtPayload`. */
export interface Actor {
  userId: string;
  role: string;
}

/**
 * Clinical access control for patient data.
 *
 * `requireRole('DOCTOR')` proves the caller is *a* doctor, never *this patient's*
 * doctor. Every Phase 4 module routes through here so the rule is written once —
 * eight modules with eight slightly different checks is how a record leaks.
 *
 * Deliberately stricter than the demographic checks in patient.service: a
 * RECEPTIONIST may register a patient and see their name and MRN, but must not read
 * consultation notes, prescriptions, or lab results.
 */

/** Roles that may read any patient's clinical record. */
const CLINICAL_ADMIN_ROLES = ["ADMIN"];

/** Front-desk roles: demographics only, never clinical content. */
export const NON_CLINICAL_ROLES = ["RECEPTIONIST", "ACCOUNTANT"];

export type AccessReason =
  | "admin"
  | "self"
  | "guardian"
  | "treating_doctor"
  | "referred_doctor"
  | "dispensing_pharmacist"
  | "lab_technician";

export interface AccessResult {
  allowed: boolean;
  reason?: AccessReason;
  /** The caller's own patient row, when they are one. */
  actorPatientId?: string;
}

async function getPatientIdForUser(userId: string): Promise<string | null> {
  const patient = await prisma.patient.findUnique({
    where: { userId },
    select: { id: true },
  });
  return patient?.id ?? null;
}

async function getDoctorIdForUser(userId: string): Promise<string | null> {
  const doctor = await prisma.doctor.findUnique({
    where: { userId },
    select: { id: true },
  });
  return doctor?.id ?? null;
}

/**
 * Patient ids a guardian may act for.
 *
 * `canViewRecords` is granular on purpose: a guardian may be allowed to book
 * appointments without being allowed to read the clinical record. An adult
 * dependant can be given booking rights while keeping their notes private.
 */
export async function getDependentPatientIds(
  guardianPatientId: string,
  permission: "records" | "booking" = "records",
): Promise<string[]> {
  const links = await prisma.patientRelationship.findMany({
    where: {
      guardianPatientId,
      ...(permission === "records" ? { canViewRecords: true } : { canBookAppointments: true }),
    },
    select: { dependentPatientId: true },
  });
  return links.map((l) => l.dependentPatientId);
}

/**
 * Resolves whether `actor` may read `patientId`'s clinical record.
 *
 * Returns a result rather than throwing so callers can branch (e.g. hide a section)
 * instead of failing a whole request. Use `assertClinicalAccess` when access is
 * required.
 */
export async function resolveClinicalAccess(
  patientId: string,
  actor: Actor,
): Promise<AccessResult> {
  if (CLINICAL_ADMIN_ROLES.includes(actor.role)) {
    return { allowed: true, reason: "admin" };
  }

  if (NON_CLINICAL_ROLES.includes(actor.role)) {
    return { allowed: false };
  }

  if (actor.role === "PATIENT") {
    const actorPatientId = await getPatientIdForUser(actor.userId);
    if (!actorPatientId) return { allowed: false };
    if (actorPatientId === patientId) {
      return { allowed: true, reason: "self", actorPatientId };
    }

    // "Is this patient" is not enough — a guardian acts for their dependants.
    const dependents = await getDependentPatientIds(actorPatientId, "records");
    if (dependents.includes(patientId)) {
      return { allowed: true, reason: "guardian", actorPatientId };
    }
    return { allowed: false, actorPatientId };
  }

  if (actor.role === "DOCTOR") {
    const doctorId = await getDoctorIdForUser(actor.userId);
    if (!doctorId) return { allowed: false };

    // A shared appointment is what makes someone "this patient's doctor".
    const shared = await prisma.appointment.findFirst({
      where: { doctorId, patientId, deletedAt: null },
      select: { id: true },
    });
    if (shared) return { allowed: true, reason: "treating_doctor" };

    // A referral grants access to the referring note only — see referral.service.
    const referral = await prisma.referral.findFirst({
      where: { toDoctorId: doctorId, patientId },
      select: { id: true },
    });
    if (referral) return { allowed: true, reason: "referred_doctor" };

    return { allowed: false };
  }

  if (actor.role === "PHARMACIST") {
    // Only while there is something to dispense. A prescription has no patientId of
    // its own — it reaches the patient through its appointment.
    const prescription = await prisma.prescription.findFirst({
      where: { isDraft: false, appointment: { patientId } },
      select: { id: true },
    });
    return prescription
      ? { allowed: true, reason: "dispensing_pharmacist" }
      : { allowed: false };
  }

  if (actor.role === "LAB_TECHNICIAN") {
    const order = await prisma.labOrder.findFirst({
      where: { patientId },
      select: { id: true },
    });
    return order ? { allowed: true, reason: "lab_technician" } : { allowed: false };
  }

  return { allowed: false };
}

/** Throws 403 unless the caller may read this patient's clinical record. */
export async function assertClinicalAccess(
  patientId: string,
  actor: Actor,
): Promise<AccessResult> {
  const result = await resolveClinicalAccess(patientId, actor);
  if (!result.allowed) {
    throw new AppError("Not authorised to access this patient's clinical record", 403);
  }
  return result;
}

/**
 * Asserts the caller may *write* clinical data for this patient.
 *
 * Narrower than reading: a patient may self-report history and vitals, but only
 * clinicians write notes, prescriptions, and results. Pharmacists and lab
 * technicians write through their own modules, not here.
 */
export async function assertClinicalWriteAccess(
  patientId: string,
  actor: Actor,
): Promise<AccessResult> {
  const result = await assertClinicalAccess(patientId, actor);
  if (result.reason === "dispensing_pharmacist" || result.reason === "lab_technician") {
    throw new AppError("Not authorised to modify this patient's record", 403);
  }
  return result;
}

/**
 * The set of patient ids a caller may see, for scoping list queries.
 *
 * `null` means unrestricted (admin). Callers must put this in the SQL `WHERE`,
 * never filter after the query — broad retrieval followed by in-app filtering is a
 * breach across patients.
 */
export async function getAccessiblePatientIds(actor: Actor): Promise<string[] | null> {
  if (CLINICAL_ADMIN_ROLES.includes(actor.role)) return null;

  if (actor.role === "PATIENT") {
    const actorPatientId = await getPatientIdForUser(actor.userId);
    if (!actorPatientId) return [];
    const dependents = await getDependentPatientIds(actorPatientId, "records");
    return [actorPatientId, ...dependents];
  }

  if (actor.role === "DOCTOR") {
    const doctorId = await getDoctorIdForUser(actor.userId);
    if (!doctorId) return [];
    const appointments = await prisma.appointment.findMany({
      where: { doctorId, deletedAt: null },
      select: { patientId: true },
      distinct: ["patientId"],
    });
    return appointments.map((a) => a.patientId);
  }

  // Front-desk and unmapped roles see no clinical records at all.
  return [];
}

/**
 * Resolves the patient a caller is acting as — themselves, or a dependant they are
 * authorised for. Used by "my record" endpoints that accept an optional `patientId`.
 */
export async function resolveActingPatientId(
  actor: Actor,
  requestedPatientId?: string,
): Promise<string> {
  const actorPatientId = await getPatientIdForUser(actor.userId);
  if (!actorPatientId) throw new AppError("Patient record not found", 404);

  if (!requestedPatientId || requestedPatientId === actorPatientId) return actorPatientId;

  const dependents = await getDependentPatientIds(actorPatientId, "records");
  if (!dependents.includes(requestedPatientId)) {
    throw new AppError("Not authorised to act for this patient", 403);
  }
  return requestedPatientId;
}
