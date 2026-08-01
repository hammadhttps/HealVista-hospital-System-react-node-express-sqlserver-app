import { prisma } from "../config/db.js";
import { getCached, setCached } from "../config/redis.js";
import type { AnalyticsOverview } from "@healvista/shared";

/**
 * Operational analytics (Phase 6.2) — ADMIN only.
 *
 * `GET /api/analytics/overview` returns every operational aggregate for a date
 * range. All aggregation happens in SQL — the server never loads rows into Node
 * to sum them. Cached 60s keyed on the range.
 *
 * **One query, not sixteen.** This started as sixteen separate `$queryRaw`
 * calls. Fired concurrently they each held a pool connection for the length of
 * the slowest, which exhausted the pool ("P2024"); run one at a time instead,
 * they cost sixteen network round trips — measured at ~1.3s each against Neon,
 * so the endpoint took over 20 seconds. Neither is a scheduling problem, so
 * neither ordering fixes it: the cost is the round trips themselves.
 *
 * Folding everything into a single statement removes both failure modes at
 * once. Two CTEs (`appt`, `pay`) apply the date range once and every aggregate
 * reads from them, so the shared filtering is also evaluated once rather than
 * sixteen times. Each aggregate returns a JSON column, giving one row back.
 *
 * Dates are bound as tagged-template parameters; optional bounds fall back to
 * "30 days ago" / "now" via COALESCE so the same SQL serves both modes.
 */

const cacheTtl = 60;
const thirtyDays = 30 * 24 * 60 * 60 * 1000;

function analyticsCacheKey(from: string | null, to: string | null): string {
  return `analytics:overview:${from ?? "begin"}:${to ?? "now"}`;
}

function parseRange(from?: string, to?: string): { from: Date | null; to: Date | null } {
  return {
    from: from ? new Date(`${from}T00:00:00.000Z`) : null,
    to: to ? new Date(`${to}T23:59:59.999Z`) : null,
  };
}

function num(n: string | number | null | undefined): number {
  return n === null || n === undefined ? 0 : typeof n === "number" ? n : Number(n);
}

/**
 * No-show percentage, to one decimal place.
 *
 * The denominator is every appointment whose slot falls in the range — including
 * cancellations, which are a different outcome from a no-show and must not be
 * excluded, or the rate silently inflates. An empty range is 0%, never NaN.
 */
export function noShowRate(noShows: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((noShows / total) * 100).toFixed(1));
}

/** The shape Postgres hands back: one row, one JSON column per aggregate. */
interface OverviewRow {
  appointmentsPerDay: Array<{ date: string; count: number }>;
  appointmentsPerDepartment: Array<{ department: string; count: number }>;
  appointmentsPerDoctor: Array<{ doctor: string; count: number }>;
  noShow: { noShows: number; total: number };
  cancellationReasons: Array<{ reason: string; count: number }>;
  timings: { waiting: number | null; consult: number | null; lead: number | null };
  patientGrowth: Array<{ date: string; count: number }>;
  doctorUtilisation: Array<{
    doctor: string;
    booked: number;
    available: number;
    utilisation: number | null;
  }>;
  revenueByDepartment: Array<{ department: string; amount: string | number }>;
  revenueByMethod: Array<{ method: string; amount: string | number }>;
  revenueByMonth: Array<{ month: string; amount: string | number }>;
  topMedicines: Array<{ medicine: string; count: number }>;
  topLabTests: Array<{ test: string; count: number }>;
  topDiagnoses: Array<{ diagnosis: string; count: number }>;
  stockLow: Array<{ medicine: string; quantity: number; reorderLevel: number }>;
  stockExpiring: Array<{ medicine: string; batchNumber: string | null; expiryDate: string }>;
}

export async function getOverview(from?: string, to?: string): Promise<AnalyticsOverview> {
  const range = parseRange(from, to);
  const cacheKey = analyticsCacheKey(from ?? null, to ?? null);
  const cached = await getCached<AnalyticsOverview>(cacheKey);
  if (cached) return cached;

  const fallbackFrom = new Date(Date.now() - thirtyDays);
  const defaultTo = new Date();

  const [row] = await prisma.$queryRaw<OverviewRow[]>`
    WITH bounds AS (
      SELECT COALESCE(${range.from}::timestamptz, ${fallbackFrom}::timestamptz) AS from_ts,
             COALESCE(${range.to}::timestamptz, ${defaultTo}::timestamptz) AS to_ts
    ),
    appt AS (
      SELECT a.id, a.status, a."cancelReason", a."createdAt", a."checkedInAt",
             a."consultStartAt", a."consultEndAt", a."departmentId", a."doctorId",
             s."startTime"
        FROM appointments a
        JOIN appointment_slots s ON s.id = a."slotId"
        CROSS JOIN bounds b
       WHERE a."deletedAt" IS NULL
         AND s."startTime" >= b.from_ts AND s."startTime" <= b.to_ts
    ),
    pay AS (
      SELECT p.id, p.amount, p.method, p."createdAt", p."billId"
        FROM payments p CROSS JOIN bounds b
       WHERE p.status = 'SUCCEEDED'
         AND p."createdAt" >= b.from_ts AND p."createdAt" <= b.to_ts
    )
    SELECT
      (SELECT COALESCE(json_agg(t ORDER BY t.date), '[]'::json) FROM (
         SELECT date_trunc('day', "startTime")::date AS date, count(*)::int AS count
           FROM appt GROUP BY 1) t) AS "appointmentsPerDay",

      (SELECT COALESCE(json_agg(t ORDER BY t.count DESC), '[]'::json) FROM (
         SELECT COALESCE(d.name, 'Unassigned') AS department, count(*)::int AS count
           FROM appt LEFT JOIN departments d ON d.id = appt."departmentId"
          GROUP BY 1) t) AS "appointmentsPerDepartment",

      (SELECT COALESCE(json_agg(t ORDER BY t.count DESC), '[]'::json) FROM (
         SELECT d2."fullName" AS doctor, count(*)::int AS count
           FROM appt JOIN doctors d2 ON d2.id = appt."doctorId"
          GROUP BY 1) t) AS "appointmentsPerDoctor",

      (SELECT json_build_object(
         'noShows', count(*) FILTER (WHERE status = 'NO_SHOW')::int,
         'total', count(*)::int) FROM appt) AS "noShow",

      (SELECT COALESCE(json_agg(t ORDER BY t.count DESC), '[]'::json) FROM (
         SELECT COALESCE("cancelReason", 'Not specified') AS reason, count(*)::int AS count
           FROM appt WHERE status = 'CANCELLED' GROUP BY 1) t) AS "cancellationReasons",

      (SELECT json_build_object(
         'waiting', round(avg(extract(epoch FROM ("consultStartAt" - "checkedInAt")) / 60)::numeric, 1),
         'consult', round(avg(extract(epoch FROM ("consultEndAt" - "consultStartAt")) / 60)::numeric, 1),
         'lead',    round(avg(extract(epoch FROM ("startTime" - "createdAt")) / 86400)::numeric, 2))
         FROM appt WHERE "consultStartAt" IS NOT NULL AND "checkedInAt" IS NOT NULL) AS "timings",

      (SELECT COALESCE(json_agg(t ORDER BY t.date), '[]'::json) FROM (
         SELECT date_trunc('day', p."createdAt")::date AS date, count(*)::int AS count
           FROM patients p CROSS JOIN bounds b
          WHERE p."deletedAt" IS NULL
            AND p."createdAt" >= b.from_ts AND p."createdAt" <= b.to_ts
          GROUP BY 1) t) AS "patientGrowth",

      (SELECT COALESCE(json_agg(t ORDER BY t.utilisation DESC NULLS LAST), '[]'::json) FROM (
         SELECT d."fullName" AS doctor,
                count(DISTINCT a.id)::int AS booked,
                count(s.id)::int AS available,
                round((count(DISTINCT a.id) * 100.0 / NULLIF(count(s.id), 0))::numeric, 1) AS utilisation
           FROM appointment_slots s
           JOIN doctors d ON d.id = s."doctorId"
           LEFT JOIN appointments a ON a."slotId" = s.id AND a."deletedAt" IS NULL
           CROSS JOIN bounds b
          WHERE s."startTime" >= b.from_ts AND s."startTime" <= b.to_ts
          GROUP BY 1) t) AS "doctorUtilisation",

      (SELECT COALESCE(json_agg(t ORDER BY t.amount DESC), '[]'::json) FROM (
         SELECT COALESCE(d.name, 'Unassigned') AS department, sum(pay.amount)::numeric(12,2) AS amount
           FROM pay
           JOIN bills bl ON bl.id = pay."billId"
           LEFT JOIN appointments a ON a.id = bl."appointmentId"
           LEFT JOIN departments d ON d.id = a."departmentId"
          GROUP BY 1) t) AS "revenueByDepartment",

      (SELECT COALESCE(json_agg(t ORDER BY t.amount DESC), '[]'::json) FROM (
         SELECT method, sum(amount)::numeric(12,2) AS amount FROM pay GROUP BY 1) t)
        AS "revenueByMethod",

      (SELECT COALESCE(json_agg(t ORDER BY t.month), '[]'::json) FROM (
         SELECT date_trunc('month', "createdAt")::date AS month, sum(amount)::numeric(12,2) AS amount
           FROM pay GROUP BY 1) t) AS "revenueByMonth",

      (SELECT COALESCE(json_agg(t ORDER BY t.count DESC), '[]'::json) FROM (
         SELECT pi."medicineName" AS medicine, count(*)::int AS count
           FROM prescription_items pi
           JOIN prescriptions pr ON pr.id = pi."prescriptionId"
           CROSS JOIN bounds b
          WHERE pr."deletedAt" IS NULL
            AND pr."createdAt" >= b.from_ts AND pr."createdAt" <= b.to_ts
          GROUP BY 1 ORDER BY count DESC LIMIT 10) t) AS "topMedicines",

      (SELECT COALESCE(json_agg(t ORDER BY t.count DESC), '[]'::json) FROM (
         SELECT lt.name AS test, count(*)::int AS count
           FROM lab_order_items li
           JOIN lab_tests lt ON lt.id = li."labTestId"
           JOIN lab_orders lo ON lo.id = li."labOrderId"
           CROSS JOIN bounds b
          WHERE lo."orderedAt" >= b.from_ts AND lo."orderedAt" <= b.to_ts
          GROUP BY 1 ORDER BY count DESC LIMIT 10) t) AS "topLabTests",

      (SELECT COALESCE(json_agg(t ORDER BY t.count DESC), '[]'::json) FROM (
         SELECT unnest("diagnosisCodes") AS diagnosis, count(*)::int AS count
           FROM consultation_notes CROSS JOIN bounds b
          WHERE "signedAt" IS NOT NULL
            AND "createdAt" >= b.from_ts AND "createdAt" <= b.to_ts
          GROUP BY 1 ORDER BY count DESC LIMIT 10) t) AS "topDiagnoses",

      (SELECT COALESCE(json_agg(t ORDER BY t.quantity), '[]'::json) FROM (
         SELECT m.name AS medicine, i.quantity, i."reorderLevel"
           FROM inventory i JOIN medicines m ON m.id = i."medicineId"
          WHERE i.quantity <= i."reorderLevel"
          ORDER BY i.quantity ASC LIMIT 10) t) AS "stockLow",

      (SELECT COALESCE(json_agg(t ORDER BY t."expiryDate"), '[]'::json) FROM (
         SELECT m.name AS medicine, i."batchNumber", i."expiryDate"
           FROM inventory i JOIN medicines m ON m.id = i."medicineId"
          WHERE i."expiryDate" IS NOT NULL
            AND i."expiryDate" <= now() + interval '90 days'
          ORDER BY i."expiryDate" ASC LIMIT 10) t) AS "stockExpiring"
  `;

  const timings = row?.timings;
  const noShows = Number(row?.noShow?.noShows ?? 0);
  const total = Number(row?.noShow?.total ?? 0);

  const out: AnalyticsOverview = {
    range: { from: from ?? null, to: to ?? null },
    appointmentsPerDay: (row?.appointmentsPerDay ?? []).map((r) => ({
      date: String(r.date),
      count: Number(r.count),
    })),
    appointmentsPerDepartment: (row?.appointmentsPerDepartment ?? []).map((r) => ({
      department: r.department ?? "Unassigned",
      count: Number(r.count),
    })),
    appointmentsPerDoctor: (row?.appointmentsPerDoctor ?? []).map((r) => ({
      doctor: r.doctor,
      count: Number(r.count),
    })),
    noShow: { noShows, total, rate: noShowRate(noShows, total) },
    cancellationReasons: (row?.cancellationReasons ?? []).map((r) => ({
      reason: r.reason,
      count: Number(r.count),
    })),
    avgWaitingTimeMins: timings?.waiting != null ? num(timings.waiting) : null,
    avgConsultationMins: timings?.consult != null ? num(timings.consult) : null,
    avgLeadTimeDays: timings?.lead != null ? num(timings.lead) : null,
    patientGrowth: (row?.patientGrowth ?? []).map((r) => ({
      date: String(r.date),
      count: Number(r.count),
    })),
    doctorUtilisation: (row?.doctorUtilisation ?? []).map((r) => ({
      doctor: r.doctor,
      booked: Number(r.booked),
      available: Number(r.available),
      utilisation: Number(r.utilisation ?? 0),
    })),
    revenueByDepartment: (row?.revenueByDepartment ?? []).map((r) => ({
      department: r.department,
      amount: num(r.amount),
    })),
    revenueByMethod: (row?.revenueByMethod ?? []).map((r) => ({
      method: r.method,
      amount: num(r.amount),
    })),
    revenueByMonth: (row?.revenueByMonth ?? []).map((r) => ({
      month: String(r.month).slice(0, 7),
      amount: num(r.amount),
    })),
    topMedicines: (row?.topMedicines ?? []).map((r) => ({
      medicine: r.medicine,
      count: Number(r.count),
    })),
    topLabTests: (row?.topLabTests ?? []).map((r) => ({ test: r.test, count: Number(r.count) })),
    topDiagnoses: (row?.topDiagnoses ?? []).map((r) => ({
      diagnosis: r.diagnosis,
      count: Number(r.count),
    })),
    stockLow: (row?.stockLow ?? []).map((r) => ({
      medicine: r.medicine,
      quantity: Number(r.quantity),
      reorderLevel: Number(r.reorderLevel),
    })),
    stockExpiring: (row?.stockExpiring ?? []).map((s) => ({
      medicine: s.medicine,
      batchNumber: s.batchNumber,
      expiryDate: new Date(s.expiryDate).toISOString(),
    })),
  };

  await setCached(cacheKey, out, cacheTtl);
  return out;
}
