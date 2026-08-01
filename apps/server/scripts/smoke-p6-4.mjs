import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const { listAuditLogs, getPatientActivity } = await import("../dist/services/compliance.service.js");
const { setVerificationStatus } = await import("../dist/services/doctor.service.js");

const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
const patient = await prisma.patient.findFirst({ include: { user: true } });

const page = await listAuditLogs({ pageSize: 5 });
console.log("audit page: total =", page.total, "| returned =", page.entries.length);
console.log("recent actions:", page.entries.map((e) => e.action).join(", "));

const filtered = await listAuditLogs({ action: "LOGIN_SUCCESS", pageSize: 3 });
console.log("LOGIN_SUCCESS entries:", filtered.total);

const timeline = await getPatientActivity(patient.id, { userId: patient.user.id, role: "PATIENT" });
console.log("patient timeline entries:", timeline.length);

try {
  await getPatientActivity(patient.id, { userId: "someone-else", role: "DOCTOR" });
  console.log("LEAK: doctor read another patient's timeline");
} catch (e) { console.log("doctor blocked from timeline:", e.message.slice(0, 45)); }

const doc = await prisma.doctor.findFirst();
if (doc && admin) {
  const before = doc.verificationStatus;
  await setVerificationStatus(doc.id, "VERIFIED", admin.id, undefined, "127.0.0.1");
  const log = await prisma.auditLog.findFirst({ where: { action: "VERIFY_DOCTOR", targetId: doc.id }, orderBy: { createdAt: "desc" } });
  console.log("VERIFY_DOCTOR audited:", !!log, "| metadata:", JSON.stringify(log?.metadata));
  await prisma.doctor.update({ where: { id: doc.id }, data: { verificationStatus: before } });
}
await prisma.$disconnect();
process.exit(0);
