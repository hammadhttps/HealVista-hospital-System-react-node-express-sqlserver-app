import { z } from "zod";

/**
 * Audit & compliance (Phase 6.4).
 *
 * Audit logs are append-only — these schemas describe reads and the two
 * subject-rights actions (export, deletion). There is deliberately no schema for
 * updating or deleting an audit entry, because no such endpoint exists.
 */

export const auditLogQuerySchema = z.object({
  actorUserId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(80).optional(),
  targetType: z.string().trim().min(1).max(80).optional(),
  targetId: z.string().trim().min(1).max(100).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;

export interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  ipAddress: string | null;
  createdAt: string;
  correctionOfId: string | null;
  actor: { id: string; email: string; role: string } | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

/** One access event on a patient's record — who read it, when, and why they could. */
export interface PatientActivityEntry {
  id: string;
  action: string;
  createdAt: string;
  actor: { id: string; email: string; role: string } | null;
}

export const exportRequestSchema = z.object({
  format: z.enum(["json", "pdf", "both"]).default("both"),
});

export type ExportRequestInput = z.infer<typeof exportRequestSchema>;

export interface DataExportStatus {
  id: string;
  status: "pending" | "processing" | "ready" | "failed";
  fileUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/**
 * Account deletion. Requires the password so a hijacked session cannot start the
 * clock on someone's account, and an explicit confirmation phrase.
 */
export const deletionRequestSchema = z.object({
  password: z.string().min(1),
  confirm: z.literal("DELETE MY ACCOUNT"),
});

export type DeletionRequestInput = z.infer<typeof deletionRequestSchema>;

export interface DeletionRequestStatus {
  id: string;
  scheduledFor: string;
  cancelledAt: string | null;
  completedAt: string | null;
}

/** Days between requesting deletion and anonymisation running. */
export const DELETION_GRACE_DAYS = 30;
