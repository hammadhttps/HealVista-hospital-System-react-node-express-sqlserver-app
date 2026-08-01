import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
const doctor = await prisma.user.findFirst({ where: { role: "DOCTOR" } });
const patient = await prisma.user.findFirst({ where: { role: "PATIENT" } });
console.log("users:", { admin: admin?.email, doctor: doctor?.email, patient: patient?.email });

await prisma.$disconnect();

// Import the compiled services from dist to exercise the real code path.
const { getDashboard } = await import("../dist/services/dashboard.service.js");
const { getOverview } = await import("../dist/services/opsAnalytics.service.js");

for (const u of [admin, doctor, patient]) {
  if (!u) continue;
  const d = await getDashboard(u.role, u.id);
  console.log(`\n== ${u.role} ==`);
  console.log("  kpis:", d.kpis.map((k) => `${k.label}=${k.value}`).join(", "));
  console.log("  sections:", d.sections.map((s) => `${s.title}(${s.items.length})`).join(", "));
}

const ov = await getOverview();
console.log("\n== overview ==");
console.log(
  "  perDay:",
  ov.appointmentsPerDay.length,
  "perDept:",
  ov.appointmentsPerDepartment.length,
  "noShow:",
  JSON.stringify(ov.noShow),
  "util:",
  ov.doctorUtilisation.length,
  "revenueByDept:",
  ov.revenueByDepartment.length,
  "topMeds:",
  ov.topMedicines.length,
);
