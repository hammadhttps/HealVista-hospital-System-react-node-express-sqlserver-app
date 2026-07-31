import { prisma } from "../config/db.js";
import { Prisma } from "@prisma/client";

export async function writeAuditLog(params: {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const data: Prisma.AuditLogCreateInput = {
    actor: { connect: { id: params.actorUserId } },
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    ipAddress: params.ipAddress ?? null,
    metadata: params.metadata as any,
  };
  await prisma.auditLog.create({ data });
}
