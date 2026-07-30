import { prisma } from "../config/db";
import { AppError } from "../utils/AppError";

export async function list(search?: string) {
  const where: any = { deletedAt: null };
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { user: { email: { contains: search, mode: "insensitive" } } },
    ];
  }
  return prisma.doctor.findMany({
    where,
    include: {
      user: { select: { id: true, email: true, avatarUrl: true } },
      departments: { include: { department: true } },
    },
    orderBy: { fullName: "asc" },
  });
}

export async function getDoctorById(id: string) {
  const doctor = await prisma.doctor.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, phone: true, avatarUrl: true } },
      departments: { include: { department: true } },
    },
  });
  if (!doctor || doctor.deletedAt) throw new AppError("Doctor not found", 404);
  return doctor;
}

export async function getProfileByUserId(userId: string) {
  const doctor = await prisma.doctor.findUnique({
    where: { userId },
    include: {
      user: { select: { id: true, email: true, phone: true, avatarUrl: true } },
      departments: { include: { department: true } },
    },
  });
  if (!doctor || doctor.deletedAt) throw new AppError("Doctor profile not found", 404);
  return doctor;
}

export async function updateProfile(
  userId: string,
  data: {
    fullName?: string;
    bio?: string;
    licenseNumber?: string;
    experienceYears?: number;
    consultationFee?: number;
    consultationMins?: number;
    languages?: string[];
    qualifications?: string[];
  },
) {
  const doctor = await prisma.doctor.findUnique({ where: { userId } });
  if (!doctor) throw new AppError("Doctor profile not found", 404);
  return prisma.doctor.update({ where: { userId }, data });
}
