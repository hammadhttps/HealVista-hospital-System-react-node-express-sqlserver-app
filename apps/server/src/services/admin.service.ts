import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import type { AdminCreateUserInput, UserListQueryInput } from "@healvista/shared";

const BCRYPT_ROUNDS = 12;

function generateMrn(): string {
  return `MRN-${Date.now().toString(36).toUpperCase()}-${crypto.randomInt(1000, 9999)}`;
}

function generateEmployeeCode(): string {
  return `EMP-${Date.now().toString(36).toUpperCase()}-${crypto.randomInt(1000, 9999)}`;
}

export async function listUsers(params: UserListQueryInput) {
  const { search, role, page, limit } = params;
  const where: any = { deletedAt: null };

  if (role) where.role = role;
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { patient: { fullName: { contains: search, mode: "insensitive" } } },
      { doctor: { fullName: { contains: search, mode: "insensitive" } } },
      { receptionist: { fullName: { contains: search, mode: "insensitive" } } },
      { pharmacist: { fullName: { contains: search, mode: "insensitive" } } },
      { labTechnician: { fullName: { contains: search, mode: "insensitive" } } },
      { accountant: { fullName: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        phone: true,
        emailVerifiedAt: true,
        createdAt: true,
        patient: { select: { fullName: true, mrn: true } },
        doctor: { select: { fullName: true, verificationStatus: true } },
        receptionist: { select: { fullName: true } },
        pharmacist: { select: { fullName: true } },
        labTechnician: { select: { fullName: true } },
        accountant: { select: { fullName: true } },
      },
    }),
  ]);

  const staffProfiles = await prisma.staffProfile.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: { userId: true, employeeCode: true, designation: true, status: true },
  });
  const staffMap = new Map(staffProfiles.map((s) => [s.userId, s]));

  return {
    users: users.map((u) => ({ ...u, staffProfile: staffMap.get(u.id) ?? null })),
    total,
  };
}

export async function createUser(input: AdminCreateUserInput, actorUserId?: string) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError("Email already registered", 409);

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: input.role,
        phone: input.phone,
        emailVerifiedAt: new Date(),
        isActive: true,
        patient:
          input.role === "PATIENT"
            ? {
                create: {
                  mrn: generateMrn(),
                  fullName: input.fullName,
                  dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
                  gender: input.gender,
                  bloodGroup: input.bloodGroup,
                  addressLine1: input.addressLine1,
                  city: input.city,
                  registeredById: actorUserId,
                },
              }
            : undefined,
        doctor:
          input.role === "DOCTOR"
            ? {
                create: {
                  fullName: input.fullName,
                  licenseNumber: input.licenseNumber,
                  consultationFee: input.consultationFee ?? 150,
                  consultationMins: input.consultationMins ?? 30,
                  verificationStatus: "VERIFIED",
                  qualifications: ["Board Certified"],
                  languages: ["English"],
                },
              }
            : undefined,
        receptionist:
          input.role === "RECEPTIONIST"
            ? { create: { fullName: input.fullName, deskLocation: input.deskLocation } }
            : undefined,
        pharmacist:
          input.role === "PHARMACIST"
            ? { create: { fullName: input.fullName, licenseNo: input.licenseNumber } }
            : undefined,
        labTechnician:
          input.role === "LAB_TECHNICIAN"
            ? {
                create: {
                  fullName: input.fullName,
                  licenseNo: input.licenseNumber,
                  canVerify: input.canVerify ?? false,
                },
              }
            : undefined,
        accountant:
          input.role === "ACCOUNTANT" ? { create: { fullName: input.fullName } } : undefined,
      },
    });

    await tx.passwordHistory.create({
      data: { userId: user.id, passwordHash },
    });

    if (input.role !== "PATIENT" && input.role !== "ADMIN") {
      await tx.staffProfile.create({
        data: {
          userId: user.id,
          departmentId: input.departmentId,
          designation: input.designation,
          employeeCode: generateEmployeeCode(),
          employmentDate: new Date(),
          status: "active",
        },
      });
    }

    if (input.role === "DOCTOR" && input.departmentId) {
      const doctorProfile = await tx.doctor.findUnique({ where: { userId: user.id } });
      if (doctorProfile) {
        await tx.doctorDepartment.create({
          data: {
            doctorId: doctorProfile.id,
            departmentId: input.departmentId,
            isPrimary: true,
          },
        });
      }
    }

    return user;
  });

  if (actorUserId) {
    await writeAuditLog({
      actorUserId,
      action: "USER_CREATED",
      targetType: "User",
      targetId: created.id,
      metadata: { role: input.role, email: input.email },
    });
  }

  return created;
}
