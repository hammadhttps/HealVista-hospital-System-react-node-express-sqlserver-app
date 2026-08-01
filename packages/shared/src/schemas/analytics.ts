import { z } from "zod";

/**
 * Role dashboards (6.1) and operational analytics (6.2).
 *
 * Every value is computed on the server in SQL (`GROUP BY` / `$queryRaw`) — the
 * client renders, it never aggregates. The dashboard endpoint returns a role's
 * KPI set; `/api/analytics/overview` returns the admin date-range breakdown.
 */

export const analyticsRangeSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type AnalyticsRangeInput = z.infer<typeof analyticsRangeSchema>;

export const dashboardKpiSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  trend: z.number().optional(),
});

export type DashboardKpi = z.infer<typeof dashboardKpiSchema>;

export const dashboardSectionSchema = z.object({
  title: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      subtitle: z.string().optional(),
      meta: z.string().optional(),
      href: z.string().optional(),
    }),
  ),
});

export type DashboardSection = z.infer<typeof dashboardSectionSchema>;

export const dashboardDataSchema = z.object({
  role: z.enum([
    "PATIENT",
    "DOCTOR",
    "RECEPTIONIST",
    "PHARMACIST",
    "LAB_TECHNICIAN",
    "ACCOUNTANT",
    "ADMIN",
  ]),
  kpis: z.array(dashboardKpiSchema),
  sections: z.array(dashboardSectionSchema),
  cachedAt: z.string().optional(),
});

export type DashboardData = z.infer<typeof dashboardDataSchema>;
export type DashboardRole = DashboardData["role"];

/** A named row that any aggregate section resolves to (client renders generically). */
export interface AnalyticsTable {
  columns: string[];
  rows: Record<string, string | number | null>[];
}

export interface AnalyticsOverview {
  range: { from: string | null; to: string | null };
  appointmentsPerDay: { date: string; count: number }[];
  appointmentsPerDepartment: { department: string; count: number }[];
  appointmentsPerDoctor: { doctor: string; count: number }[];
  noShow: { noShows: number; total: number; rate: number };
  cancellationReasons: { reason: string; count: number }[];
  avgWaitingTimeMins: number | null;
  avgConsultationMins: number | null;
  avgLeadTimeDays: number | null;
  patientGrowth: { date: string; count: number }[];
  doctorUtilisation: { doctor: string; booked: number; available: number; utilisation: number }[];
  revenueByDepartment: { department: string; amount: number }[];
  revenueByMethod: { method: string; amount: number }[];
  revenueByMonth: { month: string; amount: number }[];
  topMedicines: { medicine: string; count: number }[];
  topLabTests: { test: string; count: number }[];
  topDiagnoses: { diagnosis: string; count: number }[];
  stockLow: { medicine: string; quantity: number; reorderLevel: number }[];
  stockExpiring: { medicine: string; batchNumber: string | null; expiryDate: string | null }[];
}
