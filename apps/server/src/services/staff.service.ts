import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";

export async function list() {
  const profiles = await prisma.staffProfile.findMany({
    orderBy: { employeeCode: "asc" },
  });

  const userIds = profiles.map((p) => p.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, role: true, isActive: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return profiles.map((p) => ({ ...p, user: userMap.get(p.userId) ?? null }));
}

export async function update(
  userId: string,
  data: { departmentId?: string; designation?: string; status?: string },
  actorUserId?: string,
) {
  const profile = await prisma.staffProfile.findUnique({ where: { userId } });
  if (!profile) throw new AppError("Staff profile not found", 404);

  const updated = await prisma.staffProfile.update({ where: { userId }, data });

  if (actorUserId) {
    await writeAuditLog({
      actorUserId,
      action: "STAFF_UPDATED",
      targetType: "StaffProfile",
      targetId: profile.id,
    });
  }

  return updated;
}
