import { prisma } from "../config/db.js";
import { cached, delCached, cacheKeys } from "../config/redis.js";
import { AppError } from "../utils/AppError.js";
import type { CreateDepartmentInput, UpdateDepartmentInput } from "@healvista/shared";

/**
 * The department list is the most-requested read in the app — booking, search,
 * registration and the symptom checker all load it, and it changes a few times a
 * year. Cached for an hour and dropped explicitly on every write, so the only
 * way to serve a stale list is to bypass this module.
 */
const LIST_TTL_SECONDS = 60 * 60;

export async function list(slug?: string) {
  // Only the unfiltered list is cached: a slug lookup is already a unique-index
  // hit, and caching per-slug would multiply keys for no gain.
  if (slug) {
    return prisma.department.findMany({
      where: { slug },
      orderBy: { name: "asc" },
      include: { doctors: { include: { doctor: true } } },
    });
  }

  return cached(cacheKeys.departments, LIST_TTL_SECONDS, () =>
    prisma.department.findMany({
      orderBy: { name: "asc" },
      include: { doctors: { include: { doctor: true } } },
    }),
  );
}

async function invalidateList(): Promise<void> {
  await delCached(cacheKeys.departments);
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
  const created = await prisma.department.create({ data: input });
  await invalidateList();
  return created;
}

export async function update(id: string, input: UpdateDepartmentInput) {
  await getById(id);
  const updated = await prisma.department.update({ where: { id }, data: input });
  await invalidateList();
  return updated;
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
  await invalidateList();
}
