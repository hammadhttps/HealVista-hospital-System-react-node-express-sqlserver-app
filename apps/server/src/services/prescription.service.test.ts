import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../config/db.js";
import { writeAuditLog } from "../utils/audit.js";
import { createPrescription, warningKey } from "./prescription.service.js";

vi.mock("../config/db", () => ({
  prisma: {
    doctor: { findUnique: vi.fn() },
    appointment: { findUnique: vi.fn() },
    patientAllergy: { findMany: vi.fn() },
    prescriptionItem: { findMany: vi.fn() },
    drugInteraction: { findMany: vi.fn() },
    prescription: { create: vi.fn() },
  },
}));

vi.mock("./access.service.js", () => ({
  assertClinicalAccess: vi.fn().mockResolvedValue({ allowed: true, reason: "treating_doctor" }),
}));

// settings.service (a transitive import) pulls in config/redis, which imports the
// env schema and process.exit(1)s when env vars are absent in the test runner.
vi.mock("../config/redis", () => ({
  redis: {},
  getCached: vi.fn(),
  setCached: vi.fn(),
  delCached: vi.fn(),
  cached: vi.fn(),
  cacheKeys: { settings: "settings:hospital", departments: "departments:all" },
}));

// createPrescription enqueues the issued prescription for embedding; with no real
// Redis the BullMQ queue would hang forever retrying, so the queue is stubbed.
vi.mock("../config/bull.js", () => ({
  embeddingsQueue: null,
  recordQueue: null,
  addRecordExtractionJob: vi.fn(),
  addEmbeddingJob: vi.fn(),
}));

vi.mock("../utils/audit.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("./notification.service.js", () => ({ scheduleFollowUpReminder: vi.fn() }));

const actor = { userId: "u1", role: "DOCTOR" };
const doctor = { id: "doc1", fullName: "Dr A", licenseNumber: "L1" };
const appointment = { id: "appt1", patientId: "p1", doctorId: "doc1" };

const aspirin = {
  medicineName: "Aspirin 75mg",
  dosage: "75mg",
  frequency: "od",
  durationDays: 30,
};

/**
 * The two patient-safety rules with the worst failure modes in this module:
 *
 * 1. A SEVERE allergy is an absolute contraindication — 409, no override. A clinician
 *    must never be able to route around it by passing `acknowledgedWarnings`.
 * 2. When the doctor *does* proceed past a moderate warning, the acknowledgement is
 *    recorded — "the system warned them and they proceeded" is what a medico-legal
 *    review asks about, and it must be auditable, not merely displayed.
 */
describe("createPrescription safety enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.doctor.findUnique).mockResolvedValue(doctor as never);
    vi.mocked(prisma.appointment.findUnique).mockResolvedValue(appointment as never);
    vi.mocked(prisma.prescriptionItem.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.drugInteraction.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.prescription.create).mockResolvedValue({ id: "rx1" } as never);
  });

  it("hard-blocks a SEVERE allergy match with 409 and never writes the prescription", async () => {
    vi.mocked(prisma.patientAllergy.findMany).mockResolvedValue([
      { allergen: "Penicillin", severity: "SEVERE", reaction: "Anaphylaxis" },
    ] as never);

    await expect(
      createPrescription(
        {
          appointmentId: "appt1",
          items: [
            {
              medicineName: "Penicillin V 250mg",
              dosage: "250mg",
              frequency: "tid",
              durationDays: 7,
            },
          ],
        },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.prescription.create).not.toHaveBeenCalled();
  });

  it("cannot be overridden — acknowledging the warning still 409s on a SEVERE match", async () => {
    vi.mocked(prisma.patientAllergy.findMany).mockResolvedValue([
      { allergen: "Penicillin", severity: "SEVERE", reaction: "Anaphylaxis" },
    ] as never);

    const key = warningKey({
      kind: "allergy",
      severity: "SEVERE",
      medicineName: "Penicillin V 250mg",
      allergen: "Penicillin",
      reaction: "Anaphylaxis",
      blocking: true,
    });

    await expect(
      createPrescription(
        {
          appointmentId: "appt1",
          items: [
            {
              medicineName: "Penicillin V 250mg",
              dosage: "250mg",
              frequency: "tid",
              durationDays: 7,
            },
          ],
          acknowledgedWarnings: [key],
        },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.prescription.create).not.toHaveBeenCalled();
  });

  it("refuses to issue while a moderate warning is unacknowledged", async () => {
    vi.mocked(prisma.patientAllergy.findMany).mockResolvedValue([
      { allergen: "Aspirin", severity: "MODERATE", reaction: "Rash" },
    ] as never);

    await expect(
      createPrescription({ appointmentId: "appt1", items: [aspirin] }, actor),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.prescription.create).not.toHaveBeenCalled();
  });

  it("records the explicit acknowledgement when the doctor proceeds", async () => {
    vi.mocked(prisma.patientAllergy.findMany).mockResolvedValue([
      { allergen: "Aspirin", severity: "MODERATE", reaction: "Rash" },
    ] as never);

    const key = warningKey({
      kind: "allergy",
      severity: "MODERATE",
      medicineName: "Aspirin 75mg",
      allergen: "Aspirin",
      reaction: "Rash",
      blocking: false,
    });

    await createPrescription(
      { appointmentId: "appt1", items: [aspirin], acknowledgedWarnings: [key] },
      actor,
    );

    expect(prisma.prescription.create).toHaveBeenCalledTimes(1);

    // The audit trail records what was shown and what was accepted — the medico-legal
    // paper trail, persisted at issue time.
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PRESCRIPTION_ISSUED",
        targetType: "prescription",
        metadata: expect.objectContaining({
          warningsShown: expect.arrayContaining([key]),
          warningsAcknowledged: expect.arrayContaining([key]),
        }),
      }),
    );
  });
});
