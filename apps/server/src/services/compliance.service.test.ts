import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { getPatientActivity, requestDeletion } from "./compliance.service.js";
import { prisma } from "../config/db.js";

vi.mock("../config/db.js", () => ({
  prisma: {
    patient: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    auditLog: { findMany: vi.fn() },
    accountDeletionRequest: { upsert: vi.fn() },
  },
}));

vi.mock("../utils/audit.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../workers/compliance.worker.js", () => ({
  enqueueExport: vi.fn(),
  enqueueAnonymise: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

/**
 * The activity timeline names which clinicians have opened a person's record, so
 * who may read it is itself a disclosure decision.
 */
describe("patient activity timeline", () => {
  it("lets a patient read their own access history", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);

    await expect(getPatientActivity("p1", { userId: "u1", role: "PATIENT" })).resolves.toEqual([]);
  });

  it("lets an admin read anyone's", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([] as never);

    await expect(getPatientActivity("p1", { userId: "admin", role: "ADMIN" })).resolves.toEqual([]);
  });

  it("refuses a different patient", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ userId: "u1" } as never);

    await expect(getPatientActivity("p1", { userId: "u2", role: "PATIENT" })).rejects.toThrow(
      /cannot view/i,
    );
  });

  it("refuses a doctor — being a clinician is not being this patient's clinician", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ userId: "u1" } as never);

    await expect(getPatientActivity("p1", { userId: "doc", role: "DOCTOR" })).rejects.toThrow(
      /cannot view/i,
    );
  });
});

/**
 * Deletion starts a 30-day clock that ends in anonymisation, so it must not be
 * reachable from a session alone.
 */
describe("account deletion request", () => {
  const patientUser = { id: "u1", role: "PATIENT", passwordHash: "hashed" };

  it("rejects a wrong password without scheduling anything", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(patientUser as never);
    vi.spyOn(bcrypt, "compare").mockResolvedValue(false as never);

    await expect(requestDeletion("u1", "not-the-password")).rejects.toThrow(/password/i);
    expect(prisma.accountDeletionRequest.upsert).not.toHaveBeenCalled();
  });

  it("refuses a staff account even with the correct password", async () => {
    // A clinician cannot anonymise themselves out of notes they signed.
    // Note the password is verified *first*, so this path never reveals to an
    // unauthenticated caller whether an account is staff.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...patientUser,
      role: "DOCTOR",
    } as never);
    vi.spyOn(bcrypt, "compare").mockResolvedValue(true as never);

    await expect(requestDeletion("u1", "correct-password")).rejects.toThrow(/administrator/i);
    expect(prisma.accountDeletionRequest.upsert).not.toHaveBeenCalled();
  });

  it("refuses an account with no password set (OAuth-only) rather than skipping the check", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...patientUser,
      passwordHash: null,
    } as never);

    await expect(requestDeletion("u1", "anything")).rejects.toThrow(/password/i);
    expect(prisma.accountDeletionRequest.upsert).not.toHaveBeenCalled();
  });
});
