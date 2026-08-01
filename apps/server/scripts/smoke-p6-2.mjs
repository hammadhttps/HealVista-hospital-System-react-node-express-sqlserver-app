import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const users = await prisma.user.findMany({ select: { id: true, role: true, email: true } });
await prisma.$disconnect();

const { getDashboard } = await import("../dist/services/dashboard.service.js");
const { getOverview } = await import("../dist/services/opsAnalytics.service.js");

for (const role of [
  "DOCTOR",
  "PATIENT",
  "RECEPTIONIST",
  "PHARMACIST",
  "LAB_TECHNICIAN",
  "ACCOUNTANT",
  "ADMIN",
]) {
  const u = users.find((x) => x.role === role);
  if (!u) {
    console.log(`${role}: no user`);
    continue;
  }
  const t0 = Date.now();
  try {
    const d = await getDashboard(role, u.id);
    console.log(
      `${role}: ${d.kpis.map((k) => k.label + "=" + k.value).join(", ")}  [${Date.now() - t0}ms]`,
    );
  } catch (e) {
    console.log(`${role}: ERROR ${e.message} [${Date.now() - t0}ms]`);
  }
}

const t0 = Date.now();
try {
  const ov = await getOverview();
  console.log(
    `overview: perDay=${ov.appointmentsPerDay.length} perDept=${ov.appointmentsPerDepartment.length} noShow=${JSON.stringify(ov.noShow)} util=${ov.doctorUtilisation.length} revDept=${ov.revenueByDepartment.length} meds=${ov.topMedicines.length} labs=${ov.topLabTests.length} diag=${ov.topDiagnoses.length} stockLow=${ov.stockLow.length} [${Date.now() - t0}ms]`,
  );
} catch (e) {
  console.log(`overview: ERROR ${e.message} [${Date.now() - t0}ms]`);
}
process.exit(0);
