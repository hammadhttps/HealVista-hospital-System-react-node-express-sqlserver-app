import { prisma } from "../config/db.js";
import { redis } from "../config/redis.js";
import { AppError } from "../utils/AppError.js";
import {
  ruleBasedDepartmentSlugs,
  suggestDepartments,
  type DepartmentSuggestion,
} from "../ai/symptom.service.js";
import type { Actor } from "./access.service.js";

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
  const updated = await prisma.doctor.update({ where: { userId }, data });
  if (redis) {
    await redis.del(`doctor:${doctor.id}`);
    await redis.del(`doctor:profile:${userId}`);
  }
  return updated;
}

export async function getAvailability(doctorId: string) {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor || doctor.deletedAt) throw new AppError("Doctor not found", 404);
  return prisma.doctorAvailability.findMany({
    where: { doctorId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

export async function upsertAvailability(
  doctorId: string,
  entries: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    breakStart?: string | null;
    breakEnd?: string | null;
    slotDurationMins?: number;
    isActive?: boolean;
  }>,
) {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor || doctor.deletedAt) throw new AppError("Doctor not found", 404);

  await prisma.doctorAvailability.deleteMany({ where: { doctorId } });

  if (entries.length === 0) return [];

  const created = await Promise.all(
    entries.map((entry) =>
      prisma.doctorAvailability.create({
        data: {
          doctorId,
          dayOfWeek: entry.dayOfWeek,
          startTime: entry.startTime,
          endTime: entry.endTime,
          breakStart: entry.breakStart ?? null,
          breakEnd: entry.breakEnd ?? null,
          slotDurationMins: entry.slotDurationMins ?? 30,
          isActive: entry.isActive ?? true,
        },
      }),
    ),
  );

  if (redis) {
    await redis.del(`doctor:availability:${doctorId}`);
  }

  return created;
}

export async function getExceptions(doctorId: string) {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor || doctor.deletedAt) throw new AppError("Doctor not found", 404);
  return prisma.availabilityException.findMany({
    where: { doctorId },
    orderBy: { startDate: "desc" },
  });
}

export async function createException(
  doctorId: string,
  data: {
    type: "LEAVE" | "CONFERENCE" | "SURGERY" | "EMERGENCY" | "OTHER";
    startDate: string;
    endDate: string;
    reason?: string | null;
  },
) {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor || doctor.deletedAt) throw new AppError("Doctor not found", 404);

  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);

  if (endDate < startDate) throw new AppError("End date must be after start date", 400);

  const exception = await prisma.availabilityException.create({
    data: {
      doctorId,
      type: data.type,
      startDate,
      endDate,
      reason: data.reason ?? null,
    },
  });

  const bookedAppointments = await prisma.appointment.findMany({
    where: {
      doctorId,
      slot: {
        startTime: { gte: startDate, lte: endDate },
      },
      status: { in: ["CONFIRMED", "CHECKED_IN", "PENDING_PAYMENT"] },
    },
    include: { slot: true, patient: { select: { fullName: true } } },
  });

  if (redis) {
    await redis.del(`doctor:exceptions:${doctorId}`);
  }

  return { exception, affectedAppointments: bookedAppointments };
}

export async function deleteException(doctorId: string, exceptionId: string) {
  const exception = await prisma.availabilityException.findUnique({
    where: { id: exceptionId },
  });
  if (!exception) throw new AppError("Exception not found", 404);
  if (exception.doctorId !== doctorId) throw new AppError("Not your exception", 403);

  await prisma.availabilityException.delete({ where: { id: exceptionId } });

  if (redis) {
    await redis.del(`doctor:exceptions:${doctorId}`);
  }
}

export async function listDoctors(filters: {
  departmentId?: string;
  minFee?: number;
  maxFee?: number;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const where: any = { deletedAt: null, verificationStatus: "VERIFIED" };
  const { departmentId, minFee, maxFee, search, page = 1, limit = 20 } = filters;

  if (departmentId) {
    where.departments = { some: { departmentId } };
  }
  if (minFee !== undefined || maxFee !== undefined) {
    where.consultationFee = {};
    if (minFee !== undefined) where.consultationFee.gte = minFee;
    if (maxFee !== undefined) where.consultationFee.lte = maxFee;
  }
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { bio: { contains: search, mode: "insensitive" } },
    ];
  }

  const [doctors, total] = await Promise.all([
    prisma.doctor.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, avatarUrl: true } },
        departments: { include: { department: true } },
        availability: { where: { isActive: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { averageRating: "desc" },
    }),
    prisma.doctor.count({ where }),
  ]);

  return { doctors, total, page, limit };
}

export async function getDoctorWithSlots(doctorId: string) {
  const cacheKey = `doctor:${doctorId}`;
  if (redis) {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: {
      user: { select: { id: true, email: true, avatarUrl: true } },
      departments: { include: { department: true } },
      availability: { where: { isActive: true } },
    },
  });
  if (!doctor || doctor.deletedAt) throw new AppError("Doctor not found", 404);

  if (redis) {
    await redis.setex(cacheKey, 300, JSON.stringify(doctor));
  }
  return doctor;
}

export async function getSlotsForDate(doctorId: string, date: string) {
  const cacheKey = `slots:${doctorId}:${date}`;
  if (redis) {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  const slots = await prisma.appointmentSlot.findMany({
    where: {
      doctorId,
      startTime: { gte: startOfDay, lte: endOfDay },
      isBlocked: false,
    },
    orderBy: { startTime: "asc" },
  });

  if (redis) {
    await redis.setex(cacheKey, 30, JSON.stringify(slots));
  }
  return slots;
}

export interface DepartmentMatch {
  slug: string;
  departmentId: string;
  departmentName: string;
  confidence: number;
  reason?: string;
}

/**
 * Symptom → department matching. Upgraded in Phase 5.4: Gemini ranks the
 * departments first, the deterministic keyword map stays as the fallback, and the
 * response states which path produced it. A provider outage or a non-configured
 * server falls straight through to the rules — the front-desk flow never depends on
 * the AI being up.
 */
export async function matchDoctorsBySymptom(symptom: string, actor?: Actor) {
  const ruleSlugs = ruleBasedDepartmentSlugs(symptom);

  // The AI path never throws to the caller — `suggestDepartments` returns null on
  // any failure and the rules take over.
  const aiSuggestions: DepartmentSuggestion[] | null = await suggestDepartments(symptom, actor);

  let matchedSlugs: string[] = [];
  let source: "ai" | "rules" = "rules";
  const confidenceBySlug: Record<string, number> = {};

  if (aiSuggestions && aiSuggestions.length > 0) {
    matchedSlugs = aiSuggestions.map((s) => s.slug).slice(0, 3);
    for (const s of aiSuggestions) confidenceBySlug[s.slug] = s.confidence;
    source = "ai";
  } else {
    matchedSlugs = ruleSlugs;
  }

  const emptyResult = (suggestedDepartment: string) => ({
    source,
    suggestions: [] as DepartmentMatch[],
    suggestedDepartment,
    doctors: [] as never[],
  });

  if (matchedSlugs.length === 0) return emptyResult("general-medicine");

  const departments = await prisma.department.findMany({
    where: { slug: { in: matchedSlugs }, isActive: true },
  });

  if (departments.length === 0) return emptyResult("general-medicine");

  const suggestions: DepartmentMatch[] = departments.map((d) => ({
    slug: d.slug,
    departmentId: d.id,
    departmentName: d.name,
    confidence: confidenceBySlug[d.slug] ?? 0.5,
    reason: source === "ai" ? aiSuggestions?.find((s) => s.slug === d.slug)?.reason : undefined,
  }));

  const doctors = await prisma.doctor.findMany({
    where: {
      departments: { some: { departmentId: { in: departments.map((d) => d.id) } } },
      deletedAt: null,
      verificationStatus: "VERIFIED",
    },
    include: {
      user: { select: { id: true, email: true, avatarUrl: true } },
      departments: { include: { department: true } },
    },
    orderBy: { averageRating: "desc" },
    take: 10,
  });

  return { source, suggestions, suggestedDepartment: departments[0].slug, doctors };
}
