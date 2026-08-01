import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
console.log("admin:", admin ? admin.email : "NONE");
if (!admin) process.exit(1);

// Import compiled service via tsx is unreliable on this machine; re-run SQL inline instead.
const kpis = await prisma.$queryRaw`
  SELECT
    (SELECT count(*) FROM users WHERE "deletedAt" IS NULL) AS users,
    (SELECT count(*) FROM departments) AS departments,
    (SELECT count(*) FROM appointments WHERE "deletedAt" IS NULL AND status = 'NO_SHOW') AS noShows`;
console.log("admin kpi row:", kpis[0]);

const noShow = await prisma.$queryRaw`
  SELECT
    count(*) FILTER (WHERE a.status = 'NO_SHOW') AS "noShows",
    count(*) AS total
  FROM appointments a
  JOIN appointment_slots s ON s.id = a."slotId"
  WHERE a."deletedAt" IS NULL AND s."startTime" >= now() - interval '30 days'`;
console.log("no-show row:", noShow[0]);

const revenue = await prisma.$queryRaw`
  SELECT COALESCE(d.name, 'Unassigned') AS department, p.method AS method,
    date_trunc('month', p."createdAt")::date AS month, sum(p.amount)::numeric(12,2) AS amount
  FROM payments p
  JOIN bills b ON b.id = p."billId"
  LEFT JOIN appointments a ON a.id = b."appointmentId"
  LEFT JOIN departments d ON d.id = a."departmentId"
  WHERE p.status = 'SUCCEEDED' AND p."createdAt" >= now() - interval '30 days'
  GROUP BY 1, 2, 3`;
console.log("revenue rows:", revenue.length);

await prisma.$disconnect();
