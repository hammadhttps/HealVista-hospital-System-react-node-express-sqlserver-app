import { prisma } from "../config/db.js";
import { getCached, setCached, redis } from "../config/redis.js";
import type { DashboardData, DashboardKpi, DashboardSection } from "@healvista/shared";

/**
 * Role dashboards (Phase 6.1).
 *
 * One endpoint, `GET /api/dashboard`, returns the caller's role-appropriate KPI
 * set. Every number is an aggregate computed in SQL — never by loading rows into
 * Node. Results are cached in Redis for 60s; the cache key includes the role and
 * the caller's identity where the set is scoped to one person (patients, doctors).
 *
 * Column names are quoted camelCase because the schema was created with
 * `@@map` tables but default Prisma column naming.
 *
 * **Each dashboard issues its queries in parallel.** They were written as a
 * sequence of `await`s, which costs one network round trip each — against a
 * managed Postgres that is ~1.3s of latency per dashboard load with nothing to
 * show for it. These are small indexed point queries with no ordering
 * dependency between them, so `Promise.all` is safe here in a way it is not for
 * the heavy scans in `opsAnalytics.service.ts`: a handful of short-lived
 * connections, released almost immediately, rather than a dozen long ones held
 * until the slowest finishes.
 */

const cacheTtl = 60;

function dashboardCacheKey(role: string, userId: string): string {
  return `dashboard:${role}:${userId}`;
}

function kpi(
  key: string,
  label: string,
  value: number | string,
  unit?: string,
  trend?: number,
): DashboardKpi {
  return { key, label, value, unit, trend };
}

function dayBounds(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

async function patientDashboard(userId: string): Promise<DashboardData> {
  const patient = await prisma.patient.findUnique({ where: { userId } });
  if (!patient) throw new Error("Patient profile not found");

  const now = new Date();
  const kpis: DashboardKpi[] = [];
  const sections: DashboardSection[] = [];

  const [nextAppointment, appointmentTotals, outstandingRow, latestRx, recentReports, pendingLabs] =
    await Promise.all([
      prisma.appointment.findFirst({
        where: {
          patientId: patient.id,
          deletedAt: null,
          status: { notIn: ["CANCELLED", "NO_SHOW", "COMPLETED"] },
          slot: { startTime: { gte: now } },
        },
        orderBy: { slot: { startTime: "asc" } },
        include: { slot: true, doctor: { select: { fullName: true } } },
      }),
      prisma.$queryRaw<
        Array<{ totalAppointments: bigint }>
      >`SELECT count(*) AS "totalAppointments" FROM appointments
         WHERE "patientId" = ${patient.id} AND "deletedAt" IS NULL`,
      prisma.$queryRaw<
        Array<{ outstanding: string }>
      >`SELECT coalesce(sum(balance), 0)::numeric(12,2) AS outstanding FROM bills
         WHERE "patientId" = ${patient.id} AND "deletedAt" IS NULL AND balance > 0`,
      prisma.prescription.findFirst({
        where: { appointment: { patientId: patient.id }, deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { items: { take: 3, select: { medicineName: true } } },
      }),
      prisma.medicalRecord.findMany({
        where: { patientId: patient.id, deletedAt: null },
        orderBy: { uploadedAt: "desc" },
        take: 5,
        select: { id: true, title: true, uploadedAt: true },
      }),
      prisma.labOrder.findMany({
        where: { patientId: patient.id, status: { notIn: ["COMPLETED", "VERIFIED", "CANCELLED"] } },
        orderBy: { orderedAt: "desc" },
        take: 5,
        select: { id: true, orderNumber: true, status: true },
      }),
    ]);

  sections.push({
    title: "Next appointment",
    items: nextAppointment
      ? [
          {
            id: nextAppointment.id,
            label: nextAppointment.doctor.fullName,
            subtitle: nextAppointment.slot.startTime.toISOString(),
            href: "/patient/appointments",
          },
        ]
      : [],
  });

  kpis.push(
    kpi(
      "totalAppointments",
      "Total appointments",
      Number(appointmentTotals[0]?.totalAppointments ?? 0),
    ),
  );
  kpis.push(
    kpi(
      "outstandingBalance",
      "Outstanding balance",
      Number(outstandingRow[0]?.outstanding ?? 0),
      "currency",
    ),
  );

  sections.push({
    title: "Latest prescription",
    items: latestRx
      ? [
          {
            id: latestRx.id,
            label: latestRx.items.map((i) => i.medicineName).join(", "),
            subtitle: latestRx.createdAt.toISOString(),
            href: "/patient/records",
          },
        ]
      : [],
  });

  sections.push({
    title: "Recent reports",
    items: recentReports.map((r) => ({
      id: r.id,
      label: r.title,
      subtitle: r.uploadedAt.toISOString(),
      href: "/patient/records",
    })),
  });

  sections.push({
    title: "Pending lab results",
    items: pendingLabs.map((l) => ({
      id: l.id,
      label: l.orderNumber,
      meta: l.status,
      href: "/patient/lab-results",
    })),
  });

  return { role: "PATIENT", kpis, sections };
}

async function doctorDashboard(userId: string): Promise<DashboardData> {
  const doctor = await prisma.doctor.findUnique({ where: { userId } });
  if (!doctor) throw new Error("Doctor profile not found");

  const kpis: DashboardKpi[] = [];
  const sections: DashboardSection[] = [];
  const { start: dayStart, end: dayEnd } = dayBounds();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [todayRows, seenRows, consultRows, notesRows, criticalRows, todaysQueue] =
    await Promise.all([
      prisma.$queryRaw<
        Array<{
          scheduled: bigint;
          completed: bigint;
          cancelled: bigint;
          waiting: bigint;
          inConsultation: bigint;
        }>
      >`SELECT
          count(*) FILTER (WHERE a.status IN ('CONFIRMED','PENDING_PAYMENT')) AS scheduled,
          count(*) FILTER (WHERE a.status = 'COMPLETED') AS completed,
          count(*) FILTER (WHERE a.status = 'CANCELLED') AS cancelled,
          count(*) FILTER (WHERE a.status = 'CHECKED_IN') AS waiting,
          count(*) FILTER (WHERE a.status = 'IN_CONSULTATION') AS "inConsultation"
         FROM appointments a
         JOIN appointment_slots s ON s.id = a."slotId"
         WHERE a."doctorId" = ${doctor.id} AND a."deletedAt" IS NULL
           AND s."startTime" >= ${dayStart} AND s."startTime" < ${dayEnd}`,

      prisma.$queryRaw<
        Array<{ patientsSeen: bigint }>
      >`SELECT count(DISTINCT "patientId") AS "patientsSeen" FROM appointments
         WHERE "doctorId" = ${doctor.id} AND "deletedAt" IS NULL
           AND status = 'COMPLETED' AND "consultEndAt" >= ${weekAgo}`,

      prisma.$queryRaw<
        Array<{ avgConsultMins: string | null }>
      >`SELECT round(avg(extract(epoch FROM ("consultEndAt" - "consultStartAt")) / 60)::numeric, 1) AS "avgConsultMins"
         FROM appointments
         WHERE "doctorId" = ${doctor.id} AND "deletedAt" IS NULL
           AND "consultStartAt" IS NOT NULL AND "consultEndAt" IS NOT NULL`,

      prisma.$queryRaw<
        Array<{ pendingNotes: bigint }>
      >`SELECT count(*) AS "pendingNotes" FROM consultation_notes cn
         JOIN appointments a ON a.id = cn."appointmentId"
         WHERE a."doctorId" = ${doctor.id} AND a."deletedAt" IS NULL AND cn."signedAt" IS NULL`,

      prisma.$queryRaw<
        Array<{ criticalResults: bigint }>
      >`SELECT count(DISTINCT lo.id) AS "criticalResults"
         FROM lab_orders lo
         JOIN lab_order_items li ON li."labOrderId" = lo.id
         WHERE lo."doctorId" = ${doctor.id} AND li.flag = 'CRITICAL' AND lo.status = 'COMPLETED'`,

      prisma.appointment.findMany({
        where: {
          doctorId: doctor.id,
          deletedAt: null,
          status: { in: ["CHECKED_IN", "IN_CONSULTATION"] },
        },
        orderBy: { slot: { startTime: "asc" } },
        take: 15,
        select: {
          id: true,
          patient: { select: { fullName: true } },
          status: true,
          slot: { select: { startTime: true } },
        },
      }),
    ]);

  const today = todayRows[0];
  kpis.push(kpi("todayScheduled", "Scheduled today", Number(today?.scheduled ?? 0)));
  kpis.push(kpi("todayCompleted", "Completed today", Number(today?.completed ?? 0)));
  kpis.push(kpi("todayCancelled", "Cancelled today", Number(today?.cancelled ?? 0)));
  kpis.push(kpi("todayWaiting", "Waiting today", Number(today?.waiting ?? 0)));
  kpis.push(kpi("todayInConsultation", "In consultation", Number(today?.inConsultation ?? 0)));
  kpis.push(kpi("patientsSeenWeek", "Patients this week", Number(seenRows[0]?.patientsSeen ?? 0)));
  kpis.push(
    kpi("avgConsultMins", "Avg consultation", Number(consultRows[0]?.avgConsultMins ?? 0), "min"),
  );
  kpis.push(kpi("pendingNotes", "Pending notes", Number(notesRows[0]?.pendingNotes ?? 0)));
  kpis.push(
    kpi("criticalResults", "Critical results", Number(criticalRows[0]?.criticalResults ?? 0)),
  );

  sections.push({
    title: "Today's queue",
    items: todaysQueue.map((a) => ({
      id: a.id,
      label: a.patient.fullName,
      subtitle: a.slot.startTime.toISOString(),
      meta: a.status,
      href: `/consultation/${a.id}`,
    })),
  });

  return { role: "DOCTOR", kpis, sections };
}

async function receptionistDashboard(): Promise<DashboardData> {
  const kpis: DashboardKpi[] = [];
  const sections: DashboardSection[] = [];
  const { start: dayStart } = dayBounds();

  const [todayRows, pendingRows, queueLengths] = await Promise.all([
    prisma.$queryRaw<Array<{ checkIns: bigint; walkIns: bigint }>>`SELECT
        count(*) FILTER (WHERE "checkedInAt" IS NOT NULL) AS "checkIns",
        count(*) FILTER (WHERE source = 'WALK_IN') AS "walkIns"
       FROM appointments
       WHERE "deletedAt" IS NULL AND "createdAt" >= ${dayStart}`,
    prisma.$queryRaw<
      Array<{ pendingPayments: string }>
    >`SELECT coalesce(sum(balance), 0)::numeric(12,2) AS "pendingPayments" FROM bills
       WHERE "deletedAt" IS NULL AND balance > 0`,
    prisma.$queryRaw<
      Array<{ doctor: string; waiting: bigint }>
    >`SELECT d."fullName" AS doctor, count(*) AS waiting
       FROM appointments a
       JOIN doctors d ON d.id = a."doctorId"
       WHERE a."deletedAt" IS NULL AND a.status IN ('CHECKED_IN','IN_CONSULTATION')
       GROUP BY 1 ORDER BY waiting DESC`,
  ]);

  kpis.push(kpi("checkInsToday", "Check-ins today", Number(todayRows[0]?.checkIns ?? 0)));
  kpis.push(kpi("walkInsToday", "Walk-ins registered", Number(todayRows[0]?.walkIns ?? 0)));
  kpis.push(
    kpi(
      "pendingPayments",
      "Pending payments",
      Number(pendingRows[0]?.pendingPayments ?? 0),
      "currency",
    ),
  );

  sections.push({
    title: "Queue length per doctor",
    items: queueLengths.map((q) => ({
      id: q.doctor,
      label: q.doctor,
      meta: `${Number(q.waiting)} waiting`,
      href: "/reception",
    })),
  });

  return { role: "RECEPTIONIST", kpis, sections };
}

async function pharmacistDashboard(): Promise<DashboardData> {
  const kpis: DashboardKpi[] = [];
  const sections: DashboardSection[] = [];

  const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const [dispenseRows, stockRows, lowStockItems] = await Promise.all([
    prisma.$queryRaw<
      Array<{ pendingDispenses: bigint }>
    >`SELECT count(*) AS "pendingDispenses" FROM prescriptions
       WHERE "deletedAt" IS NULL AND "dispenseStatus" = 'PENDING'`,
    prisma.$queryRaw<
      Array<{ lowStock: bigint; criticalStock: bigint; expiringSoon: bigint }>
    >`SELECT
        count(*) FILTER (WHERE quantity <= "reorderLevel") AS "lowStock",
        count(*) FILTER (WHERE quantity = 0) AS "criticalStock",
        count(*) FILTER (WHERE "expiryDate" IS NOT NULL AND "expiryDate" <= ${ninetyDays}) AS "expiringSoon"
       FROM inventory`,
    prisma.$queryRaw<
      Array<{ medicine: string; quantity: number; reorderLevel: number }>
    >`SELECT m.name AS medicine, i.quantity, i."reorderLevel" FROM inventory i
       JOIN medicines m ON m.id = i."medicineId"
       WHERE i.quantity <= i."reorderLevel" ORDER BY i.quantity ASC LIMIT 10`,
  ]);

  kpis.push(
    kpi("pendingDispenses", "Pending dispenses", Number(dispenseRows[0]?.pendingDispenses ?? 0)),
  );
  kpis.push(kpi("lowStock", "Low stock", Number(stockRows[0]?.lowStock ?? 0)));
  kpis.push(kpi("criticalStock", "Out of stock", Number(stockRows[0]?.criticalStock ?? 0)));
  kpis.push(kpi("expiringSoon", "Expiring in 90 days", Number(stockRows[0]?.expiringSoon ?? 0)));

  sections.push({
    title: "Low stock",
    items: lowStockItems.map((r) => ({
      id: r.medicine,
      label: r.medicine,
      meta: `${r.quantity} / reorder ${r.reorderLevel}`,
      href: "/pharmacy",
    })),
  });

  return { role: "PHARMACIST", kpis, sections };
}

async function labDashboard(): Promise<DashboardData> {
  const kpis: DashboardKpi[] = [];
  const sections: DashboardSection[] = [];

  const [orderStatuses, awaitingRows, overdueOrders] = await Promise.all([
    prisma.$queryRaw<
      Array<{ status: string; count: bigint }>
    >`SELECT status, count(*) AS count FROM lab_orders GROUP BY status ORDER BY count DESC`,
    prisma.$queryRaw<Array<{ awaitingCollection: bigint; awaitingVerification: bigint }>>`SELECT
        count(*) FILTER (WHERE status = 'ORDERED') AS "awaitingCollection",
        count(*) FILTER (WHERE status = 'COMPLETED') AS "awaitingVerification"
       FROM lab_orders`,
    prisma.$queryRaw<
      Array<{ id: string; orderNumber: string; hours: string }>
    >`SELECT lo.id, lo."orderNumber" AS "orderNumber",
            round(extract(epoch FROM (now() - lo."orderedAt")) / 3600)::int AS hours
       FROM lab_orders lo
       WHERE lo.status NOT IN ('VERIFIED','CANCELLED')
         AND EXISTS (
           SELECT 1 FROM lab_order_items li JOIN lab_tests lt ON lt.id = li."labTestId"
           WHERE li."labOrderId" = lo.id
             AND lo."orderedAt" + (lt."turnaroundHours" * interval '1 hour') < now()
         )
       ORDER BY hours DESC LIMIT 10`,
  ]);

  for (const row of orderStatuses) {
    kpis.push(kpi(`orders_${row.status.toLowerCase()}`, `Orders ${row.status}`, Number(row.count)));
  }
  kpis.push(
    kpi(
      "awaitingCollection",
      "Awaiting collection",
      Number(awaitingRows[0]?.awaitingCollection ?? 0),
    ),
  );
  kpis.push(
    kpi(
      "awaitingVerification",
      "Awaiting verification",
      Number(awaitingRows[0]?.awaitingVerification ?? 0),
    ),
  );
  kpis.push(kpi("overdue", "Overdue", overdueOrders.length));

  sections.push({
    title: "Overdue orders",
    items: overdueOrders.map((o) => ({
      id: o.id,
      label: o.orderNumber,
      meta: `${o.hours}h past turnaround`,
      href: "/lab",
    })),
  });

  return { role: "LAB_TECHNICIAN", kpis, sections };
}

async function accountantDashboard(): Promise<DashboardData> {
  const kpis: DashboardKpi[] = [];

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [revenueRows, outstandingRows, mixRows] = await Promise.all([
    prisma.$queryRaw<Array<{ today: string; month: string }>>`SELECT
        coalesce(sum(amount) FILTER (WHERE "createdAt" >= ${dayStart}), 0)::numeric(12,2) AS today,
        coalesce(sum(amount) FILTER (WHERE "createdAt" >= ${monthStart}), 0)::numeric(12,2) AS month
       FROM payments WHERE status = 'SUCCEEDED'`,
    prisma.$queryRaw<
      Array<{ outstanding: string }>
    >`SELECT coalesce(sum(balance), 0)::numeric(12,2) AS outstanding FROM bills
       WHERE "deletedAt" IS NULL AND balance > 0`,
    prisma.$queryRaw<Array<{ partialPayments: bigint; refunds: string }>>`SELECT
        (SELECT count(*) FROM bills WHERE balance > 0 AND "amountPaid" > 0) AS "partialPayments",
        coalesce((SELECT sum("refundedAmount") FROM payments WHERE "refundedAt" IS NOT NULL), 0)::numeric(12,2) AS refunds`,
  ]);

  kpis.push(kpi("revenueToday", "Revenue today", Number(revenueRows[0]?.today ?? 0), "currency"));
  kpis.push(
    kpi("revenueMonth", "Revenue this month", Number(revenueRows[0]?.month ?? 0), "currency"),
  );
  kpis.push(
    kpi(
      "outstanding",
      "Outstanding balance",
      Number(outstandingRows[0]?.outstanding ?? 0),
      "currency",
    ),
  );
  kpis.push(kpi("partialPayments", "Partial payments", Number(mixRows[0]?.partialPayments ?? 0)));
  kpis.push(kpi("refunds", "Refunds", Number(mixRows[0]?.refunds ?? 0), "currency"));

  return { role: "ACCOUNTANT", kpis, sections: [] };
}

async function adminDashboard(): Promise<DashboardData> {
  const kpis: DashboardKpi[] = [];
  const sections: DashboardSection[] = [];
  const { start: dayStart } = dayBounds();

  const [countRows, pendingDoctors, health] = await Promise.all([
    prisma.$queryRaw<
      Array<{ users: bigint; departments: bigint; appointmentsToday: bigint; noShows: bigint }>
    >`SELECT
        (SELECT count(*) FROM users WHERE "deletedAt" IS NULL) AS users,
        (SELECT count(*) FROM departments) AS departments,
        (SELECT count(*) FROM appointments WHERE "deletedAt" IS NULL AND "createdAt" >= ${dayStart}) AS "appointmentsToday",
        (SELECT count(*) FROM appointments WHERE "deletedAt" IS NULL AND status = 'NO_SHOW') AS "noShows"`,
    prisma.doctor.findMany({
      where: { verificationStatus: "PENDING", deletedAt: null },
      take: 10,
      select: { id: true, fullName: true },
    }),
    systemHealth(),
  ]);

  const counts = countRows[0];
  kpis.push(kpi("users", "Users", Number(counts?.users ?? 0)));
  kpis.push(kpi("departments", "Departments", Number(counts?.departments ?? 0)));
  kpis.push(kpi("appointmentsToday", "Appointments today", Number(counts?.appointmentsToday ?? 0)));
  kpis.push(kpi("noShows", "No-shows (all time)", Number(counts?.noShows ?? 0)));

  sections.push({
    title: "Pending doctor verification",
    items: pendingDoctors.map((d) => ({
      id: d.id,
      label: d.fullName,
      href: "/admin/staff",
    })),
  });

  sections.push(health);

  return { role: "ADMIN", kpis, sections };
}

/**
 * System health for the admin dashboard.
 *
 * Each dependency is probed independently and a failure is reported as a status
 * row rather than thrown — a dashboard whose job is to show that Redis is down
 * must not itself go down when Redis is down.
 */
async function systemHealth(): Promise<DashboardSection> {
  const dbStart = Date.now();
  const redisStart = Date.now();

  // Probed together: three independent health checks run one after another turn
  // a status panel into the slowest thing on the page.
  const [db, cache, embeddings] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(
      () => ({ id: "database", label: "Database", meta: `OK · ${Date.now() - dbStart}ms` }),
      () => ({ id: "database", label: "Database", meta: "Unreachable" }),
    ),
    !redis
      ? Promise.resolve({ id: "redis", label: "Cache & queues", meta: "Not configured" })
      : redis.ping().then(
          () => ({
            id: "redis",
            label: "Cache & queues",
            meta: `OK · ${Date.now() - redisStart}ms`,
          }),
          () => ({ id: "redis", label: "Cache & queues", meta: "Unreachable" }),
        ),
    // Embedding backlog: chunks written but not yet vectorised by the worker.
    prisma.$queryRaw<
      Array<{ pending: bigint }>
    >`SELECT count(*) AS pending FROM document_chunks WHERE embedding IS NULL`.then(
      (rows) => ({
        id: "embeddings",
        label: "Embedding backlog",
        meta: `${Number(rows[0]?.pending ?? 0)} chunk(s)`,
      }),
      () => ({ id: "embeddings", label: "Embedding backlog", meta: "Unavailable" }),
    ),
  ]);

  return { title: "System health", items: [db, cache, embeddings] };
}

const handlers: Record<string, (userId: string) => Promise<DashboardData>> = {
  PATIENT: patientDashboard,
  DOCTOR: doctorDashboard,
  RECEPTIONIST: receptionistDashboard,
  PHARMACIST: pharmacistDashboard,
  LAB_TECHNICIAN: labDashboard,
  ACCOUNTANT: accountantDashboard,
  ADMIN: adminDashboard,
};

export async function getDashboard(role: string, userId: string): Promise<DashboardData> {
  const handler = handlers[role];
  if (!handler) throw new Error(`No dashboard for role ${role}`);

  const cacheKey = dashboardCacheKey(role, userId);
  const cached = await getCached<DashboardData>(cacheKey);
  if (cached) return cached;

  const data = await handler(userId);
  await setCached(cacheKey, data, cacheTtl);
  return { ...data, cachedAt: new Date().toISOString() };
}
