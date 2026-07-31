import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import { getDependentPatientIds, type Actor } from "./access.service.js";
import type { PatientRegistrationInput } from "@medicore/shared";

const BCRYPT_ROUNDS = 12;

function generateMrn(): string {
  return `MRN-${Date.now().toString(36).toUpperCase()}-${crypto.randomInt(1000, 9999)}`;
}

export async function registerPatient(input: PatientRegistrationInput, registeredById?: string) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) throw new AppError("Email already registered", 409);

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: "PATIENT",
      phone: input.phone,
      patient: {
        create: {
          mrn: generateMrn(),
          fullName: input.fullName,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
          gender: input.gender,
          bloodGroup: input.bloodGroup,
          registeredById,
        },
      },
    },
    include: { patient: true },
  });

  if (registeredById) {
    await writeAuditLog({
      actorUserId: registeredById,
      action: "PATIENT_REGISTERED",
      targetType: "Patient",
      targetId: user.patient!.id,
    });
  }

  return user;
}

export async function listPatients(params: { search?: string; page: number; limit: number }) {
  const { search, page, limit } = params;
  const where: any = { deletedAt: null };

  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { mrn: { contains: search, mode: "insensitive" } },
      { user: { phone: { contains: search } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      include: { user: { select: { id: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.patient.count({ where }),
  ]);

  return { data, total, page, limit };
}

export async function getPatientById(id: string) {
  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, phone: true, avatarUrl: true } },
      emergencyContacts: true,
    },
  });
  if (!patient || patient.deletedAt) throw new AppError("Patient not found", 404);
  return patient;
}

export async function updatePatient(
  id: string,
  data: Partial<{
    fullName: string;
    dateOfBirth: string;
    gender: string;
    bloodGroup: string;
    maritalStatus: string;
    occupation: string;
    addressLine1: string;
    city: string;
    isOrganDonor: boolean;
  }>,
  actorUserId?: string,
) {
  await getPatientById(id);
  const updateData: any = { ...data };
  if (data.dateOfBirth) updateData.dateOfBirth = new Date(data.dateOfBirth);
  const updated = await prisma.patient.update({ where: { id }, data: updateData });

  if (actorUserId) {
    await writeAuditLog({
      actorUserId,
      action: "PATIENT_UPDATED",
      targetType: "Patient",
      targetId: id,
    });
  }

  return updated;
}

/** Staff who legitimately need emergency contacts — the front desk and clinicians. */
const EMERGENCY_CONTACT_STAFF = ["RECEPTIONIST", "DOCTOR", "ADMIN", "NURSE"];

/**
 * Emergency contacts are a relative's name and phone number. They previously had no
 * ownership check at all, so any authenticated user could read or delete any
 * patient's — the routes carry `authenticate` alone.
 */
async function assertCanManageEmergencyContacts(patientId: string, actor: Actor) {
  if (EMERGENCY_CONTACT_STAFF.includes(actor.role)) return;

  if (actor.role === "PATIENT") {
    const self = await prisma.patient.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (self?.id === patientId) return;
    if (self) {
      const dependents = await getDependentPatientIds(self.id, "booking");
      if (dependents.includes(patientId)) return;
    }
  }

  throw new AppError("Not authorised to manage this patient's emergency contacts", 403);
}

export async function createEmergencyContact(
  patientId: string,
  input: {
    name: string;
    relationship: string;
    phone: string;
    isPrimary?: boolean;
  },
  actor: Actor,
) {
  await assertCanManageEmergencyContacts(patientId, actor);
  await getPatientById(patientId);
  return prisma.emergencyContact.create({ data: { patientId, ...input } });
}

export async function listEmergencyContacts(patientId: string, actor: Actor) {
  await assertCanManageEmergencyContacts(patientId, actor);
  return prisma.emergencyContact.findMany({ where: { patientId } });
}

export async function removeEmergencyContact(
  patientId: string,
  contactId: string,
  actor: Actor,
) {
  await assertCanManageEmergencyContacts(patientId, actor);
  const contact = await prisma.emergencyContact.findFirst({
    where: { id: contactId, patientId },
  });
  if (!contact) throw new AppError("Emergency contact not found", 404);
  await prisma.emergencyContact.delete({ where: { id: contactId } });
}

export async function addFavouriteDoctor(patientId: string, doctorId: string) {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor || doctor.deletedAt) throw new AppError("Doctor not found", 404);

  try {
    return await prisma.favouriteDoctor.create({
      data: { patientId, doctorId },
      include: {
        doctor: {
          include: {
            user: { select: { avatarUrl: true } },
            departments: { include: { department: true } },
          },
        },
      },
    });
  } catch (err: any) {
    if (err.code === "P2002") throw new AppError("Already a favourite", 409);
    throw err;
  }
}

export async function removeFavouriteDoctor(patientId: string, doctorId: string) {
  const fav = await prisma.favouriteDoctor.findUnique({
    where: { patientId_doctorId: { patientId, doctorId } },
  });
  if (!fav) throw new AppError("Favourite not found", 404);
  await prisma.favouriteDoctor.delete({ where: { patientId_doctorId: { patientId, doctorId } } });
}

export async function listFavouriteDoctors(patientId: string) {
  return prisma.favouriteDoctor.findMany({
    where: { patientId },
    include: {
      doctor: {
        include: {
          user: { select: { avatarUrl: true } },
          departments: { include: { department: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPatientByUserId(userId: string) {
  const patient = await prisma.patient.findUnique({ where: { userId } });
  if (!patient) throw new AppError("Patient not found", 404);
  return patient;
}
