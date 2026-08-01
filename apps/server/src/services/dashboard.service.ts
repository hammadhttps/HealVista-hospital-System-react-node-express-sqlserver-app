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

  const nextAppointment = await prisma.appointment.findFirst({
    where: {
      patientId: patient.id,
      deletedAt: null,
      status: { notIn: ["CANCELLED", "NO_SHOW", "COMPLETED"] },
      slot: { startTime: { gte: now } },
    },
    orderBy: { slot: { startTime: "asc" } },
    include: { slot: true, doctor: { select: { fullName: true } } },
  });
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

  const [{ totalAppointments }] = await prisma.$queryRaw<
    Array<{ totalAppointments: bigint }>
  >`SELECT count(*) AS "totalAppointments" FROM appointments
     WHERE "patientId" = ${patient.id} AND "deletedAt" IS NULL`;
  kpis.push(kpi("totalAppointments", "Total appointments", Number(totalAppointments)));

  const [{ outstanding }] = await prisma.$queryRaw<
    Array<{ outstanding: string }>
  >`SELECT coalesce(sum(balance), 0)::numeric(12,2) AS outstanding FROM bills
     WHERE "patientId" = ${patient.id} AND "deletedAt" IS NULL AND balance > 0`;
  kpis.push(kpi("outstandingBalance", "Outstanding balance", Number(outstanding), "currency"));

  const latestRx = await prisma.prescription.findFirst({
    where: { appointment: { patientId: patient.id }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { items: { take: 3, select: { medicineName: true } } },
  });
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

  const recentReports = await prisma.medicalRecord.findMany({
    where: { patientId: patient.id, deletedAt: null },
    orderBy: { uploadedAt: "desc" },
    take: 5,
    select: { id: true, title: true, uploadedAt: true },
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

  const pendingLabs = await prisma.labOrder.findMany({
    where: { patientId: patient.id, status: { notIn: ["COMPLETED", "VERIFIED", "CANCELLED"] } },
    orderBy: { orderedAt: "desc" },
    take: 5,
    select: { id: true, orderNumber: true, status: true },
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

  const [{ scheduled, completed, cancelled, waiting, inConsultation }] = await prisma.$queryRaw<
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
       AND s."startTime" >= ${dayStart} AND s."startTime" < ${dayEnd}`;

  kpis.push(kpi("todayScheduled", "Scheduled today", Number(scheduled)));
  kpis.push(kpi("todayCompleted", "Completed today", Number(completed)));
  kpis.push(kpi("todayCancelled", "Cancelled today", Number(cancelled)));
  kpis.push(kpi("todayWaiting", "Waiting today", Number(waiting)));
  kpis.push(kpi("todayInConsultation", "In consultation", Number(inConsultation)));

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [{ patientsSeen }] = await prisma.$queryRaw<
    Array<{ patientsSeen: bigint }>
  >`SELECT count(DISTINCT "patientId") AS "patientsSeen" FROM appointments
     WHERE "doctorId" = ${doctor.id} AND "deletedAt" IS NULL
       AND status = 'COMPLETED' AND "consultEndAt" >= ${weekAgo}`;
  kpis.push(kpi("patientsSeenWeek", "Patients this week", Number(patientsSeen)));

  const [{ avgConsultMins }] = await prisma.$queryRaw<
    Array<{ avgConsultMins: string }>
  >`SELECT round(avg(extract(epoch FROM ("consultEndAt" - "consultStartAt")) / 60)::numeric, 1) AS "avgConsultMins"
     FROM appointments
     WHERE "doctorId" = ${doctor.id} AND "deletedAt" IS NULL
       AND "consultStartAt" IS NOT NULL AND "consultEndAt" IS NOT NULL`;
  kpis.push(kpi("avgConsultMins", "Avg consultation", Number(avgConsultMins ?? 0), "min"));

  const [{ pendingNotes }] = await prisma.$queryRaw<
    Array<{ pendingNotes: bigint }>
  >`SELECT count(*) AS "pendingNotes" FROM consultation_notes cn
     JOIN appointments a ON a.id = cn."appointmentId"
     WHERE a."doctorId" = ${doctor.id} AND a."deletedAt" IS NULL AND cn."signedAt" IS NULL`;
  kpis.push(kpi("pendingNotes", "Pending notes", Number(pendingNotes)));

  const [{ criticalResults }] = await prisma.$queryRaw<
    Array<{ criticalResults: bigint }>
  >`SELECT count(DISTINCT lo.id) AS "criticalResults"
     FROM lab_orders lo
     JOIN lab_order_items li ON li."labOrderId" = lo.id
     WHERE lo."doctorId" = ${doctor.id} AND li.flag = 'CRITICAL' AND lo.status = 'COMPLETED'`;
  kpis.push(kpi("criticalResults", "Critical results", Number(criticalResults)));

  const todaysQueue = await prisma.appointment.findMany({
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
  });
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

  const [{ checkIns, walkIns }] = await prisma.$queryRaw<
    Array<{ checkIns: bigint; walkIns: bigint }>
  >`SELECT
      count(*) FILTER (WHERE "checkedInAt" IS NOT NULL) AS "checkIns",
      count(*) FILTER (WHERE source = 'WALK_IN') AS "walkIns"
     FROM appointments
     WHERE "deletedAt" IS NULL AND "createdAt" >= ${dayStart}`;
  kpis.push(kpi("checkInsToday", "Check-ins today", Number(checkIns)));
  kpis.push(kpi("walkInsToday", "Walk-ins registered", Number(walkIns)));

  const [{ pendingPayments }] = await prisma.$queryRaw<
    Array<{ pendingPayments: string }>
  >`SELECT coalesce(sum(balance), 0)::numeric(12,2) AS "pendingPayments" FROM bills
     WHERE "deletedAt" IS NULL AND balance > 0`;
  kpis.push(kpi("pendingPayments", "Pending payments", Number(pendingPayments), "currency"));

  const queueLengths = await prisma.$queryRaw<
    Array<{ doctor: string; waiting: bigint }>
  >`SELECT d."fullName" AS doctor, count(*) AS waiting
     FROM appointments a
     JOIN doctors d ON d.id = a."doctorId"
     WHERE a."deletedAt" IS NULL AND a.status IN ('CHECKED_IN','IN_CONSULTATION')
     GROUP BY 1 ORDER BY waiting DESC`;
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

  const [{ pendingDispenses }] = await prisma.$queryRaw<
    Array<{ pendingDispenses: bigint }>
  >`SELECT count(*) AS "pendingDispenses" FROM prescriptions
     WHERE "deletedAt" IS NULL AND "dispenseStatus" = 'PENDING'`;
  kpis.push(kpi("pendingDispenses", "Pending dispenses", Number(pendingDispenses)));

  const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const [{ lowStock, criticalStock, expiringSoon }] = await prisma.$queryRaw<
    Array<{ lowStock: bigint; criticalStock: bigint; expiringSoon: bigint }>
  >`SELECT
      count(*) FILTER (WHERE quantity <= "reorderLevel") AS "lowStock",
      count(*) FILTER (WHERE quantity = 0) AS "criticalStock",
      count(*) FILTER (WHERE "expiryDate" IS NOT NULL AND "expiryDate" <= ${ninetyDays}) AS "expiringSoon"
     FROM inventory`;
  kpis.push(kpi("lowStock", "Low stock", Number(lowStock)));
  kpis.push(kpi("criticalStock", "Out of stock", Number(criticalStock)));
  kpis.push(kpi("expiringSoon", "Expiring in 90 days", Number(expiringSoon)));

  const lowStockItems = await prisma.$queryRaw<
    Array<{ medicine: string; quantity: number; reorderLevel: number }>
  >`SELECT m.name AS medicine, i.quantity, i."reorderLevel" FROM inventory i
     JOIN medicines m ON m.id = i."medicineId"
     WHERE i.quantity <= i."reorderLevel" ORDER BY i.quantity ASC LIMIT 10`;
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

  const orderStatuses = await prisma.$queryRaw<
    Array<{ status: string; count: bigint }>
  >`SELECT status, count(*) AS count FROM lab_orders GROUP BY status ORDER BY count DESC`;
  for (const row of orderStatuses) {
    kpis.push(kpi(`orders_${row.status.toLowerCase()}`, `Orders ${row.status}`, Number(row.count)));
  }

  const [{ awaitingCollection, awaitingVerification }] = await prisma.$queryRaw<
    Array<{ awaitingCollection: bigint; awaitingVerification: bigint }>
  >`SELECT
      count(*) FILTER (WHERE status = 'ORDERED') AS "awaitingCollection",
      count(*) FILTER (WHERE status = 'COMPLETED') AS "awaitingVerification"
     FROM lab_orders`;
  kpis.push(kpi("awaitingCollection", "Awaiting collection", Number(awaitingCollection)));
  kpis.push(kpi("awaitingVerification", "Awaiting verification", Number(awaitingVerification)));

  const overdueOrders = await prisma.$queryRaw<
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
     ORDER BY hours DESC LIMIT 10`;
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

  const [{ today, month }] = await prisma.$queryRaw<Array<{ today: string; month: string }>>`SELECT
      coalesce(sum(amount) FILTER (WHERE "createdAt" >= ${dayStart}), 0)::numeric(12,2) AS today,
      coalesce(sum(amount) FILTER (WHERE "createdAt" >= ${monthStart}), 0)::numeric(12,2) AS month
     FROM payments WHERE status = 'SUCCEEDED'`;
  kpis.push(kpi("revenueToday", "Revenue today", Number(today), "currency"));
  kpis.push(kpi("revenueMonth", "Revenue this month", Number(month), "currency"));

  const [{ outstanding }] = await prisma.$queryRaw<
    Array<{ outstanding: string }>
  >`SELECT coalesce(sum(balance), 0)::numeric(12,2) AS outstanding FROM bills
     WHERE "deletedAt" IS NULL AND balance > 0`;
  kpis.push(kpi("outstanding", "Outstanding balance", Number(outstanding), "currency"));

  const [{ partialPayments, refunds }] = await prisma.$queryRaw<
    Array<{ partialPayments: bigint; refunds: string }>
  >`SELECT
      (SELECT count(*) FROM bills WHERE balance > 0 AND "amountPaid" > 0) AS "partialPayments",
      coalesce((SELECT sum("refundedAmount") FROM payments WHERE "refundedAt" IS NOT NULL), 0)::numeric(12,2) AS refunds`;
  kpis.push(kpi("partialPayments", "Partial payments", Number(partialPayments)));
  kpis.push(kpi("refunds", "Refunds", Number(refunds), "currency"));

  return { role: "ACCOUNTANT", kpis, sections: [] };
}

async function adminDashboard(): Promise<DashboardData> {
  const kpis: DashboardKpi[] = [];
  const sections: DashboardSection[] = [];
  const { start: dayStart } = dayBounds();

  const [{ users, departments, appointmentsToday, noShows }] = await prisma.$queryRaw<
    Array<{ users: bigint; departments: bigint; appointmentsToday: bigint; noShows: bigint }>
  >`SELECT
      (SELECT count(*) FROM users WHERE "deletedAt" IS NULL) AS users,
      (SELECT count(*) FROM departments) AS departments,
      (SELECT count(*) FROM appointments WHERE "deletedAt" IS NULL AND "createdAt" >= ${dayStart}) AS "appointmentsToday",
      (SELECT count(*) FROM appointments WHERE "deletedAt" IS NULL AND status = 'NO_SHOW') AS "noShows"`;
  kpis.push(kpi("users", "Users", Number(users)));
  kpis.push(kpi("departments", "Departments", Number(departments)));
  kpis.push(kpi("appointmentsToday", "Appointments today", Number(appointmentsToday)));
  kpis.push(kpi("noShows", "No-shows (all time)", Number(noShows)));

  const pendingDoctors = await prisma.doctor.findMany({
    where: { verificationStatus: "PENDING" },
    take: 10,
    select: { id: true, fullName: true },
  });
  sections.push({
    title: "Pending doctor verification",
    items: pendingDoctors.map((d) => ({
      id: d.id,
      label: d.fullName,
      href: "/admin/staff",
    })),
  });

  sections.push(await systemHealth());

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
  const items: DashboardSection["items"] = [];

  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    items.push({ id: "database", label: "Database", meta: `OK · ${Date.now() - dbStart}ms` });
  } catch {
    items.push({ id: "database", label: "Database", meta: "Unreachable" });
  }

  if (!redis) {
    items.push({ id: "redis", label: "Cache & queues", meta: "Not configured" });
  } else {
    const redisStart = Date.now();
    try {
      await redis.ping();
      items.push({
        id: "redis",
        label: "Cache & queues",
        meta: `OK · ${Date.now() - redisStart}ms`,
      });
    } catch {
      items.push({ id: "redis", label: "Cache & queues", meta: "Unreachable" });
    }
  }

  // Embedding backlog: chunks written but not yet vectorised by the worker.
  try {
    const [{ pending }] = await prisma.$queryRaw<
      Array<{ pending: bigint }>
    >`SELECT count(*) AS pending FROM document_chunks WHERE embedding IS NULL`;
    items.push({
      id: "embeddings",
      label: "Embedding backlog",
      meta: `${Number(pending)} chunk(s)`,
    });
  } catch {
    items.push({ id: "embeddings", label: "Embedding backlog", meta: "Unavailable" });
  }

  return { title: "System health", items };
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
