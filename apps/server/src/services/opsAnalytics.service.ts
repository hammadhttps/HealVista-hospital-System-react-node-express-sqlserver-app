import { prisma } from "../config/db.js";
import { getCached, setCached } from "../config/redis.js";
import type { AnalyticsOverview } from "@healvista/shared";

/**
 * Operational analytics (Phase 6.2) — ADMIN only.
 *
 * `GET /api/analytics/overview` returns every operational aggregate for a date
 * range. All aggregation happens in SQL (`$queryRaw`) — the server never loads
 * rows into Node to sum them. Cached 60s keyed on the range.
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

/**
 * Run queries one at a time, preserving tuple types.
 *
 * These aggregates scan large tables, and firing them all with `Promise.all`
 * holds a connection each for as long as the slowest one runs — enough to
 * exhaust the pool and time out ("P2024") while starving the rest of the app.
 * This endpoint is admin-only and cached for 60s, so the extra wall-clock time
 * is worth far more than the contention it removes.
 */
async function sequential<T extends readonly (() => PromiseLike<unknown>)[]>(
  tasks: readonly [...T],
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: unknown[] = [];
  for (const task of tasks) results.push(await task());
  return results as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}

export async function getOverview(from?: string, to?: string): Promise<AnalyticsOverview> {
  const range = parseRange(from, to);
  const cacheKey = analyticsCacheKey(from ?? null, to ?? null);
  const cached = await getCached<AnalyticsOverview>(cacheKey);
  if (cached) return cached;

  const fallbackFrom = new Date(Date.now() - thirtyDays);
  const defaultTo = new Date();

  const [appointmentsPerDay, appointmentsPerDepartment, appointmentsPerDoctor] = await sequential([
    () => prisma.$queryRaw<
      Array<{ date: Date | string; count: bigint }>
    >`SELECT date_trunc('day', s."startTime")::date AS date, count(*) AS count
       FROM appointments a JOIN appointment_slots s ON s.id = a."slotId"
       WHERE a."deletedAt" IS NULL
         AND s."startTime" >= COALESCE(${range.from}, ${fallbackFrom})
         AND s."startTime" <= COALESCE(${range.to}, ${defaultTo})
       GROUP BY 1 ORDER BY 1`,
    () => prisma.$queryRaw<
      Array<{ department: string | null; count: bigint }>
    >`SELECT COALESCE(d.name, 'Unassigned') AS department, count(*) AS count
       FROM appointments a
       JOIN appointment_slots s ON s.id = a."slotId"
       LEFT JOIN departments d ON d.id = a."departmentId"
       WHERE a."deletedAt" IS NULL
         AND s."startTime" >= COALESCE(${range.from}, ${fallbackFrom})
         AND s."startTime" <= COALESCE(${range.to}, ${defaultTo})
       GROUP BY 1 ORDER BY count DESC`,
    () => prisma.$queryRaw<
      Array<{ doctor: string; count: bigint }>
    >`SELECT d2."fullName" AS doctor, count(*) AS count
       FROM appointments a
       JOIN appointment_slots s ON s.id = a."slotId"
       JOIN doctors d2 ON d2.id = a."doctorId"
       WHERE a."deletedAt" IS NULL
         AND s."startTime" >= COALESCE(${range.from}, ${fallbackFrom})
         AND s."startTime" <= COALESCE(${range.to}, ${defaultTo})
       GROUP BY 1 ORDER BY count DESC`,
  ]);

  const [noShowRow, cancellationReasons] = await sequential([
    () => prisma.$queryRaw<Array<{ noShows: bigint; total: bigint }>>`SELECT
        count(*) FILTER (WHERE a.status = 'NO_SHOW') AS "noShows",
        count(*) AS total
       FROM appointments a
       JOIN appointment_slots s ON s.id = a."slotId"
       WHERE a."deletedAt" IS NULL
         AND s."startTime" >= COALESCE(${range.from}, ${fallbackFrom})
         AND s."startTime" <= COALESCE(${range.to}, ${defaultTo})`,
    () => prisma.$queryRaw<
      Array<{ reason: string; count: bigint }>
    >`SELECT COALESCE(a."cancelReason", 'Not specified') AS reason, count(*) AS count
       FROM appointments a
       JOIN appointment_slots s ON s.id = a."slotId"
       WHERE a."deletedAt" IS NULL AND a.status = 'CANCELLED'
         AND s."startTime" >= COALESCE(${range.from}, ${fallbackFrom})
         AND s."startTime" <= COALESCE(${range.to}, ${defaultTo})
       GROUP BY 1 ORDER BY count DESC`,
  ]);
  const noShow = noShowRow[0];
  const noShows = Number(noShow?.noShows ?? 0);
  const total = Number(noShow?.total ?? 0);

  const [timingsRow] = await prisma.$queryRaw<
    Array<{ waiting: string | null; consult: string | null; lead: string | null }>
  >`SELECT
      round(avg(extract(epoch FROM ("consultStartAt" - "checkedInAt")) / 60)::numeric, 1) AS waiting,
      round(avg(extract(epoch FROM ("consultEndAt" - "consultStartAt")) / 60)::numeric, 1) AS consult,
      round(avg(extract(epoch FROM (s."startTime" - a."createdAt")) / 86400)::numeric, 2) AS lead
     FROM appointments a
     JOIN appointment_slots s ON s.id = a."slotId"
     WHERE a."deletedAt" IS NULL
       AND "consultStartAt" IS NOT NULL AND "checkedInAt" IS NOT NULL
       AND s."startTime" >= COALESCE(${range.from}, ${fallbackFrom})
       AND s."startTime" <= COALESCE(${range.to}, ${defaultTo})`;

  const [
    patientGrowth,
    doctorUtilisation,
    revenueByDepartment,
    revenueByMethod,
    revenueByMonth,
    topMedicines,
    topLabTests,
    topDiagnoses,
    stockLow,
    stockExpiringRows,
  ] = await sequential([
    () => prisma.$queryRaw<
      Array<{ date: Date | string; count: bigint }>
    >`SELECT date_trunc('day', p."createdAt")::date AS date, count(*) AS count
         FROM patients p
         WHERE p."deletedAt" IS NULL
           AND p."createdAt" >= COALESCE(${range.from}, ${fallbackFrom})
           AND p."createdAt" <= COALESCE(${range.to}, ${defaultTo})
         GROUP BY 1 ORDER BY 1`,
    () => prisma.$queryRaw<
      Array<{ doctor: string; booked: bigint; available: bigint; utilisation: number }>
    >`SELECT d."fullName" AS doctor,
          count(DISTINCT a.id) FILTER (WHERE a.id IS NOT NULL) AS booked,
          count(s.id) AS available,
          round((count(DISTINCT a.id) * 100.0 / NULLIF(count(s.id), 0))::numeric, 1) AS utilisation
         FROM appointment_slots s
         JOIN doctors d ON d.id = s."doctorId"
         LEFT JOIN appointments a ON a."slotId" = s.id AND a."deletedAt" IS NULL
         WHERE s."startTime" >= COALESCE(${range.from}, ${fallbackFrom})
           AND s."startTime" <= COALESCE(${range.to}, ${defaultTo})
         GROUP BY 1 ORDER BY utilisation DESC`,
    () => prisma.$queryRaw<
      Array<{ department: string; amount: string }>
    >`SELECT COALESCE(d.name, 'Unassigned') AS department, sum(p.amount)::numeric(12,2) AS amount
         FROM payments p
         JOIN bills b ON b.id = p."billId"
         LEFT JOIN appointments a ON a.id = b."appointmentId"
         LEFT JOIN departments d ON d.id = a."departmentId"
         WHERE p.status = 'SUCCEEDED'
           AND p."createdAt" >= COALESCE(${range.from}, ${fallbackFrom})
           AND p."createdAt" <= COALESCE(${range.to}, ${defaultTo})
         GROUP BY 1 ORDER BY amount DESC`,
    () => prisma.$queryRaw<
      Array<{ method: string; amount: string }>
    >`SELECT p.method AS method, sum(p.amount)::numeric(12,2) AS amount
         FROM payments p
         WHERE p.status = 'SUCCEEDED'
           AND p."createdAt" >= COALESCE(${range.from}, ${fallbackFrom})
           AND p."createdAt" <= COALESCE(${range.to}, ${defaultTo})
         GROUP BY 1 ORDER BY amount DESC`,
    () => prisma.$queryRaw<
      Array<{ month: Date | string; amount: string }>
    >`SELECT date_trunc('month', p."createdAt")::date AS month, sum(p.amount)::numeric(12,2) AS amount
         FROM payments p
         WHERE p.status = 'SUCCEEDED'
           AND p."createdAt" >= COALESCE(${range.from}, ${fallbackFrom})
           AND p."createdAt" <= COALESCE(${range.to}, ${defaultTo})
         GROUP BY 1 ORDER BY 1`,
    () => prisma.$queryRaw<
      Array<{ medicine: string; count: bigint }>
    >`SELECT pi."medicineName" AS medicine, count(*) AS count
         FROM prescription_items pi
         JOIN prescriptions pr ON pr.id = pi."prescriptionId"
         WHERE pr."deletedAt" IS NULL
           AND pr."createdAt" >= COALESCE(${range.from}, ${fallbackFrom})
           AND pr."createdAt" <= COALESCE(${range.to}, ${defaultTo})
         GROUP BY 1 ORDER BY count DESC LIMIT 10`,
    () => prisma.$queryRaw<
      Array<{ test: string; count: bigint }>
    >`SELECT lt.name AS test, count(*) AS count
         FROM lab_order_items li
         JOIN lab_tests lt ON lt.id = li."labTestId"
         JOIN lab_orders lo ON lo.id = li."labOrderId"
         WHERE lo."orderedAt" >= COALESCE(${range.from}, ${fallbackFrom})
           AND lo."orderedAt" <= COALESCE(${range.to}, ${defaultTo})
         GROUP BY 1 ORDER BY count DESC LIMIT 10`,
    () => prisma.$queryRaw<
      Array<{ diagnosis: string; count: bigint }>
    >`SELECT unnest("diagnosisCodes") AS diagnosis, count(*) AS count
         FROM consultation_notes
         WHERE "signedAt" IS NOT NULL
           AND "createdAt" >= COALESCE(${range.from}, ${fallbackFrom})
           AND "createdAt" <= COALESCE(${range.to}, ${defaultTo})
         GROUP BY 1 ORDER BY count DESC LIMIT 10`,
    () => prisma.$queryRaw<
      Array<{ medicine: string; quantity: number; reorderLevel: number }>
    >`SELECT m.name AS medicine, i.quantity, i."reorderLevel"
         FROM inventory i JOIN medicines m ON m.id = i."medicineId"
         WHERE i.quantity <= i."reorderLevel"
         ORDER BY i.quantity ASC LIMIT 10`,
    () => prisma.$queryRaw<
      Array<{ medicine: string; batchNumber: string | null; expiryDate: Date }>
    >`SELECT m.name AS medicine, i."batchNumber", i."expiryDate"
         FROM inventory i JOIN medicines m ON m.id = i."medicineId"
         WHERE i."expiryDate" IS NOT NULL
           AND i."expiryDate" <= now() + interval '90 days'
         ORDER BY i."expiryDate" ASC LIMIT 10`,
  ]);

  const stockExpiring = stockExpiringRows.map((s) => ({
    medicine: s.medicine,
    batchNumber: s.batchNumber,
    expiryDate: new Date(s.expiryDate).toISOString(),
  }));

  const out: AnalyticsOverview = {
    range: { from: from ?? null, to: to ?? null },
    appointmentsPerDay: appointmentsPerDay.map((r) => ({
      date: String(r.date),
      count: Number(r.count),
    })),
    appointmentsPerDepartment: appointmentsPerDepartment.map((r) => ({
      department: r.department ?? "Unassigned",
      count: Number(r.count),
    })),
    appointmentsPerDoctor: appointmentsPerDoctor.map((r) => ({
      doctor: r.doctor,
      count: Number(r.count),
    })),
    noShow: { noShows, total, rate: noShowRate(noShows, total) },
    cancellationReasons: cancellationReasons.map((r) => ({
      reason: r.reason,
      count: Number(r.count),
    })),
    avgWaitingTimeMins: timingsRow?.waiting != null ? num(timingsRow.waiting) : null,
    avgConsultationMins: timingsRow?.consult != null ? num(timingsRow.consult) : null,
    avgLeadTimeDays: timingsRow?.lead != null ? num(timingsRow.lead) : null,
    patientGrowth: patientGrowth.map((r) => ({ date: String(r.date), count: Number(r.count) })),
    doctorUtilisation: doctorUtilisation.map((r) => ({
      doctor: r.doctor,
      booked: Number(r.booked),
      available: Number(r.available),
      utilisation: Number(r.utilisation),
    })),
    revenueByDepartment: revenueByDepartment.map((r) => ({
      department: r.department,
      amount: num(r.amount),
    })),
    revenueByMethod: revenueByMethod.map((r) => ({ method: r.method, amount: num(r.amount) })),
    revenueByMonth: revenueByMonth.map((r) => ({
      month: String(r.month).slice(0, 7),
      amount: num(r.amount),
    })),
    topMedicines: topMedicines.map((r) => ({ medicine: r.medicine, count: Number(r.count) })),
    topLabTests: topLabTests.map((r) => ({ test: r.test, count: Number(r.count) })),
    topDiagnoses: topDiagnoses.map((r) => ({ diagnosis: r.diagnosis, count: Number(r.count) })),
    stockLow,
    stockExpiring,
  };

  await setCached(cacheKey, out, cacheTtl);
  return out;
}
