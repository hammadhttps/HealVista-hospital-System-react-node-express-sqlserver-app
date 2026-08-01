import { prisma } from "../config/db.js";

/**
 * Assembles everything the hospital holds about one person (Phase 6.4).
 *
 * Read-only and side-effect free — the worker renders and uploads it, and the
 * audit entry is written when the export is *requested*, so this can be re-run
 * on retry without polluting the trail.
 *
 * Scoped strictly to the requesting user: every query below is anchored to their
 * own `userId` or their own `patientId`. Nothing here takes a caller-supplied id.
 */

export interface ExportPayload {
  generatedAt: string;
  account: Record<string, unknown>;
  sections: Record<string, Record<string, unknown>[]>;
}

export async function buildExportPayload(userId: string): Promise<ExportPayload> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { patient: true },
  });
  if (!user) throw new Error(`User ${userId} not found`);

  const patientId = user.patient?.id;

  const [appointments, prescriptions, labOrders, bills, payments, records, vitals, notes] =
    patientId
      ? await Promise.all([
          prisma.appointment.findMany({
            where: { patientId },
            include: { slot: true, doctor: { select: { fullName: true } } },
          }),
          prisma.prescription.findMany({
            where: { appointment: { patientId }, deletedAt: null },
            include: { items: true },
          }),
          prisma.labOrder.findMany({
            where: { patientId },
            include: { items: { include: { labTest: { select: { name: true } } } } },
          }),
          prisma.bill.findMany({ where: { patientId, deletedAt: null } }),
          prisma.payment.findMany({ where: { bill: { patientId } } }),
          prisma.medicalRecord.findMany({ where: { patientId, deletedAt: null } }),
          prisma.vitalReading.findMany({ where: { patientId } }),
          // Signed notes only: an unsigned draft is not yet part of the record.
          prisma.consultationNote.findMany({
            where: { appointment: { patientId }, signedAt: { not: null } },
            include: { addenda: true },
          }),
        ])
      : [[], [], [], [], [], [], [], []];

  return {
    generatedAt: new Date().toISOString(),
    account: {
      email: user.email,
      role: user.role,
      phone: user.phone,
      createdAt: user.createdAt,
      patient: user.patient
        ? {
            mrn: user.patient.mrn,
            fullName: user.patient.fullName,
            dateOfBirth: user.patient.dateOfBirth,
            gender: user.patient.gender,
            bloodGroup: user.patient.bloodGroup,
          }
        : null,
    },
    sections: {
      Appointments: appointments as unknown as Record<string, unknown>[],
      Prescriptions: prescriptions as unknown as Record<string, unknown>[],
      "Lab orders": labOrders as unknown as Record<string, unknown>[],
      Bills: bills as unknown as Record<string, unknown>[],
      Payments: payments as unknown as Record<string, unknown>[],
      "Medical records": records as unknown as Record<string, unknown>[],
      Vitals: vitals as unknown as Record<string, unknown>[],
      "Consultation notes": notes as unknown as Record<string, unknown>[],
    },
  };
}
