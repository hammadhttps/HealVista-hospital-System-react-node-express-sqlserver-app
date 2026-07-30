import { prisma } from "../config/db";
import { AppError } from "../utils/AppError";

export interface CreateHolidayInput {
  name: string;
  date: string;
  isRecurring?: boolean;
  departmentId?: string;
}

export async function list(departmentId?: string) {
  const where = departmentId ? { departmentId } : {};
  return prisma.holiday.findMany({ where, orderBy: { date: "asc" } });
}

export async function create(input: CreateHolidayInput) {
  return prisma.holiday.create({
    data: {
      name: input.name,
      date: new Date(input.date),
      isRecurring: input.isRecurring ?? false,
      departmentId: input.departmentId,
    },
  });
}

export async function remove(id: string) {
  const holiday = await prisma.holiday.findUnique({ where: { id } });
  if (!holiday) throw new AppError("Holiday not found", 404);
  await prisma.holiday.delete({ where: { id } });
}
