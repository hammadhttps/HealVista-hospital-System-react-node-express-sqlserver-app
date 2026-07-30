import { prisma } from "../config/db";
import { AppError } from "../utils/AppError";

function getDateRange(daysAhead: number = 60) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + daysAhead);
  end.setUTCHours(23, 59, 59, 999);
  return { start: today, end };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function parseDateToUTC(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export async function generateSlotsForDoctor(doctorId: string, dateFrom?: Date, dateTo?: Date) {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { availability: { where: { isActive: true } } },
  });
  if (!doctor) throw new AppError("Doctor not found", 404);
  if (doctor.availability.length === 0) return [];

  const range = getDateRange();
  const from = dateFrom || range.start;
  const to = dateTo || range.end;

  const [holidays, exceptions, existingSlots] = await Promise.all([
    prisma.holiday.findMany({
      where: {
        date: { gte: from, lte: to },
        OR: [
          { departmentId: null },
          {
            departmentId: {
              in: (
                await prisma.doctorDepartment.findMany({
                  where: { doctorId },
                  select: { departmentId: true },
                })
              ).map((d) => d.departmentId),
            },
          },
        ],
      },
    }),
    prisma.availabilityException.findMany({
      where: { doctorId, startDate: { lte: to }, endDate: { gte: from } },
    }),
    prisma.appointmentSlot.findMany({
      where: { doctorId, startTime: { gte: from, lte: to } },
      select: { startTime: true },
    }),
  ]);

  const holidayDates = new Set(
    holidays.map((h) => {
      const d = new Date(h.date);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }),
  );

  const recurringHolidays = holidays.filter((h) => h.isRecurring);
  const existingStartTimes = new Set(existingSlots.map((s) => s.startTime.getTime()));

  const slotsToCreate: Array<{
    doctorId: string;
    startTime: Date;
    endTime: Date;
    isBlocked: boolean;
  }> = [];

  const current = new Date(from);
  while (current <= to) {
    const dateStr = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`;

    if (holidayDates.has(dateStr)) {
      current.setUTCDate(current.getUTCDate() + 1);
      continue;
    }

    for (const rh of recurringHolidays) {
      const rhDate = new Date(rh.date);
      if (
        rhDate.getUTCMonth() === current.getUTCMonth() &&
        rhDate.getUTCDate() === current.getUTCDate()
      ) {
        holidayDates.add(dateStr);
      }
    }

    if (holidayDates.has(dateStr)) {
      current.setUTCDate(current.getUTCDate() + 1);
      continue;
    }

    const dayOfWeek = current.getUTCDay();

    const isExceptionDay = exceptions.some((e) => current >= e.startDate && current <= e.endDate);

    for (const avail of doctor.availability) {
      if (avail.dayOfWeek !== dayOfWeek) continue;

      const startMin = timeToMinutes(avail.startTime);
      const endMin = timeToMinutes(avail.endTime);
      const duration = avail.slotDurationMins;
      const breakStartMin = avail.breakStart ? timeToMinutes(avail.breakStart) : -1;
      const breakEndMin = avail.breakEnd ? timeToMinutes(avail.breakEnd) : -1;

      for (let m = startMin; m + duration <= endMin; m += duration) {
        const slotStart = new Date(current);
        slotStart.setUTCHours(Math.floor(m / 60), m % 60, 0, 0);

        if (existingStartTimes.has(slotStart.getTime())) continue;

        const isDuringBreak = breakStartMin >= 0 && m >= breakStartMin && m < breakEndMin;

        slotsToCreate.push({
          doctorId,
          startTime: slotStart,
          endTime: new Date(slotStart.getTime() + duration * 60000),
          isBlocked: isExceptionDay || isDuringBreak,
        });
      }
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  if (slotsToCreate.length === 0) return [];

  const created = await prisma.appointmentSlot.createMany({
    data: slotsToCreate,
    skipDuplicates: true,
  });

  return { count: created.count, range: { from, to } };
}

export async function generateSlotsForAllDoctors() {
  const doctors = await prisma.doctor.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  const results: Array<{ doctorId: string; count: number }> = [];
  for (const d of doctors) {
    const result = await generateSlotsForDoctor(d.id);
    results.push({ doctorId: d.id, count: (result as any).count ?? 0 });
  }
  return results;
}

export async function regenerateFutureSlots(doctorId: string) {
  const now = new Date();
  await prisma.appointmentSlot.deleteMany({
    where: {
      doctorId,
      startTime: { gte: now },
      isBooked: false,
      appointment: null,
    },
  });
  return generateSlotsForDoctor(doctorId, now);
}

export async function getSlotById(slotId: string) {
  const slot = await prisma.appointmentSlot.findUnique({
    where: { id: slotId },
    include: { doctor: true },
  });
  if (!slot) throw new AppError("Slot not found", 404);
  return slot;
}

export async function lockSlotInRedis(slotId: string, patientUserId: string, ttlMs = 300000) {
  const { redis } = await import("../config/redis");
  if (!redis) return true;
  const key = `slot:${slotId}`;
  const result = await redis.set(key, patientUserId, "PX", ttlMs, "NX");
  return result === "OK";
}

export async function unlockSlotInRedis(slotId: string) {
  const { redis } = await import("../config/redis");
  if (!redis) return;
  await redis.del(`slot:${slotId}`);
}
