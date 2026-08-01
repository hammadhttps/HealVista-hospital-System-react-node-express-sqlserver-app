import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../config/db.js";
import { resolveClinicalAccess, assertClinicalAccess } from "./access.service.js";

vi.mock("../config/db", () => ({
  prisma: {
    patient: { findUnique: vi.fn() },
    patientRelationship: { findMany: vi.fn() },
    doctor: { findUnique: vi.fn() },
    appointment: { findFirst: vi.fn(), findMany: vi.fn() },
    prescription: { findFirst: vi.fn() },
    labOrder: { findFirst: vi.fn() },
  },
}));

/**
 * The 4.8 ownership audit widened every "is this the patient?" check to "is this the
 * patient *or* an authorised guardian?". These tests pin the two failure modes of
 * that change: a guardian locked out of their child's record, and a stranger let in.
 */
describe("guardian clinical access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The guardian's own patient row (the caller is a PATIENT).
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: "p1" } as never);
  });

  it("lets a guardian reach their dependant's record", async () => {
    vi.mocked(prisma.patientRelationship.findMany).mockResolvedValue([
      { dependentPatientId: "p2" },
    ] as never);

    const result = await resolveClinicalAccess("p2", { userId: "u1", role: "PATIENT" });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("guardian");
    expect(result.actorPatientId).toBe("p1");
  });

  it("only grants record access when the relationship says canViewRecords", async () => {
    // A guardian may book appointments without being allowed to read the clinical
    // record — the relationship must be checked for record permission specifically.
    vi.mocked(prisma.patientRelationship.findMany).mockResolvedValue([] as never);

    const result = await resolveClinicalAccess("p2", { userId: "u1", role: "PATIENT" });

    expect(result.allowed).toBe(false);
    expect(prisma.patientRelationship.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ guardianPatientId: "p1", canViewRecords: true }),
      }),
    );
  });

  it("refuses a stranger who has no relationship to the patient", async () => {
    vi.mocked(prisma.patientRelationship.findMany).mockResolvedValue([] as never);

    await expect(assertClinicalAccess("p99", { userId: "u1", role: "PATIENT" })).rejects.toThrow();
  });

  it("refuses a guardian reaching a patient who is not their dependant", async () => {
    // p3 is a real patient, but there is no link from p1 to p3.
    vi.mocked(prisma.patientRelationship.findMany).mockResolvedValue([
      { dependentPatientId: "p2" },
    ] as never);

    await expect(assertClinicalAccess("p3", { userId: "u1", role: "PATIENT" })).rejects.toThrow();
  });

  it("never lets a patient read another unrelated patient's record as self", async () => {
    // Even without a relationship, "is this the patient?" must still be asked first.
    vi.mocked(prisma.patientRelationship.findMany).mockResolvedValue([] as never);

    const result = await resolveClinicalAccess("p1", { userId: "u1", role: "PATIENT" });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("self");
    expect(prisma.patientRelationship.findMany).not.toHaveBeenCalled();
  });
});
