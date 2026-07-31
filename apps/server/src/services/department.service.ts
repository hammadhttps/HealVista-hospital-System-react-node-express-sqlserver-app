import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import type {
  CreateDepartmentInput,
  UpdateDepartmentInput,
} from "@healvista/shared";

export async function list(slug?: string) {
  const where = slug ? { slug } : {};
  return prisma.department.findMany({
    where,
    orderBy: { name: "asc" },
    include: { doctors: { include: { doctor: true } } },
  });
}

export async function getById(id: string) {
  const dept = await prisma.department.findUnique({
    where: { id },
    include: { doctors: { include: { doctor: true } } },
  });
  if (!dept) throw new AppError("Department not found", 404);
  return dept;
}

export async function create(input: CreateDepartmentInput) {
  const existing = await prisma.department.findUnique({
    where: { slug: input.slug },
  });
  if (existing) throw new AppError("Department slug already exists", 409);
  return prisma.department.create({ data: input });
}

export async function update(id: string, input: UpdateDepartmentInput) {
  await getById(id);
  return prisma.department.update({ where: { id }, data: input });
}

export async function remove(id: string) {
  await getById(id);
  const doctorCount = await prisma.doctorDepartment.count({
    where: { departmentId: id },
  });
  if (doctorCount > 0) {
    throw new AppError("Cannot delete department with assigned doctors", 400);
  }
  await prisma.department.delete({ where: { id } });
}
