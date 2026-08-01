import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const { globalSearch, toPrefixTsQuery } = await import("../dist/services/search.service.js");

const users = {};
for (const role of ["ADMIN", "DOCTOR", "PATIENT", "RECEPTIONIST", "PHARMACIST", "LAB_TECHNICIAN", "ACCOUNTANT"]) {
  users[role] = await prisma.user.findFirst({ where: { role } });
}
const anyPatient = await prisma.patient.findFirst({ select: { fullName: true, mrn: true } });
const anyMed = await prisma.medicine.findFirst({ select: { name: true } });
console.log("probe patient:", anyPatient?.fullName, "| medicine:", anyMed?.name);

console.log("\ntsquery:", JSON.stringify(toPrefixTsQuery("john smith")), JSON.stringify(toPrefixTsQuery("a&b|c:*!")));

for (const term of [anyPatient?.fullName?.split(" ")[0], anyMed?.name?.split(" ")[0]].filter(Boolean)) {
  console.log(`\n=== query "${term}" ===`);
  for (const [role, u] of Object.entries(users)) {
    if (!u) { console.log(`  ${role}: (no seeded user)`); continue; }
    try {
      const r = await globalSearch(u.id, role, term, 5, null);
      const summary = r.groups.map((g) => `${g.type}:${g.results.length}`).join(", ") || "none";
      console.log(`  ${role.padEnd(15)} -> ${summary}`);
    } catch (e) {
      console.log(`  ${role.padEnd(15)} -> ERROR: ${(e.meta?.message || e.message).slice(0, 100)}`);
    }
  }
}
await prisma.$disconnect();
process.exit(0);
