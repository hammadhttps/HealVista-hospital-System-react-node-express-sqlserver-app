import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../config/db.js";
import {
  hasSufficientStock,
  remainingOnItem,
  deriveDispenseStatus,
  findPatientsForBatch,
} from "./pharmacy.service.js";

vi.mock("../config/db", () => ({
  prisma: {
    inventoryTransaction: { findMany: vi.fn() },
    prescription: { findMany: vi.fn() },
  },
}));

// config/redis imports the env schema, which process.exit(1)s when env vars are
// absent in the test runner. It is not used by the functions under test.
vi.mock("../config/redis", () => ({ redis: {}, getCached: vi.fn(), setCached: vi.fn() }));

// notification.service pulls in sockets → env, which exits the test runner. The
// functions under test never dispatch notifications.
vi.mock("./notification.service.js", () => ({ dispatchNotification: vi.fn() }));

/**
 * The stock floor. Its failure mode is quiet: a system that clamps to zero keeps
 * working and keeps disagreeing with the shelf, and nobody finds out until a count.
 */
describe("hasSufficientStock", () => {
  it("allows dispensing less than stock", () => {
    expect(hasSufficientStock(10, 3)).toBe(true);
  });

  it("allows dispensing exactly all remaining stock", () => {
    expect(hasSufficientStock(5, 5)).toBe(true);
  });

  it("refuses to dispense one more than stock", () => {
    expect(hasSufficientStock(5, 6)).toBe(false);
  });

  it("refuses to dispense from empty stock", () => {
    expect(hasSufficientStock(0, 1)).toBe(false);
  });

  it("rejects zero and negative quantities", () => {
    // A negative "dispense" would increase stock through the dispensing path,
    // bypassing the adjustment audit trail entirely.
    expect(hasSufficientStock(10, 0)).toBe(false);
    expect(hasSufficientStock(10, -5)).toBe(false);
  });

  it("rejects fractional quantities", () => {
    expect(hasSufficientStock(10, 1.5)).toBe(false);
  });
});

describe("remainingOnItem", () => {
  it("reports what is still owed", () => {
    expect(remainingOnItem({ quantityPrescribed: 20, quantityDispensed: 8 })).toBe(12);
  });

  it("reports zero for a fully dispensed line", () => {
    expect(remainingOnItem({ quantityPrescribed: 20, quantityDispensed: 20 })).toBe(0);
  });

  it("never reports negative remaining if over-dispensed data exists", () => {
    // Bad data must not turn into a negative that a caller treats as a credit.
    expect(remainingOnItem({ quantityPrescribed: 10, quantityDispensed: 14 })).toBe(0);
  });
});

describe("deriveDispenseStatus", () => {
  it("is PENDING when nothing has been handed over", () => {
    expect(
      deriveDispenseStatus([
        { quantityPrescribed: 10, quantityDispensed: 0 },
        { quantityPrescribed: 5, quantityDispensed: 0 },
      ]),
    ).toBe("PENDING");
  });

  it("is PARTIAL when one line is short", () => {
    expect(
      deriveDispenseStatus([
        { quantityPrescribed: 10, quantityDispensed: 10 },
        { quantityPrescribed: 5, quantityDispensed: 2 },
      ]),
    ).toBe("PARTIAL");
  });

  it("is DISPENSED only when every line is complete", () => {
    expect(
      deriveDispenseStatus([
        { quantityPrescribed: 10, quantityDispensed: 10 },
        { quantityPrescribed: 5, quantityDispensed: 5 },
      ]),
    ).toBe("DISPENSED");
  });

  it("does not mark a prescription DISPENSED because its first line is complete", () => {
    // The mistake that closes a prescription while the patient is still owed a drug.
    expect(
      deriveDispenseStatus([
        { quantityPrescribed: 10, quantityDispensed: 10 },
        { quantityPrescribed: 5, quantityDispensed: 0 },
      ]),
    ).toBe("PARTIAL");
  });
});

/**
 * Batch recall. The whole feature depends on the ledger recording `batchNumber`
 * alongside `prescriptionId` — the join from "this batch is contaminated" to "these
 * are the patients who received it". The tests pin the shape of that join: it must
 * use the ledger, not the inventory row, and must return each patient once.
 */
describe("findPatientsForBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns exactly the patients who received the batch, once each", async () => {
    // One patient received the batch across two dispensing events.
    vi.mocked(prisma.inventoryTransaction.findMany).mockResolvedValue([
      { prescriptionId: "rx1", createdAt: new Date("2026-07-01") },
      { prescriptionId: "rx1", createdAt: new Date("2026-07-02") },
      { prescriptionId: "rx2", createdAt: new Date("2026-07-03") },
    ] as never);
    vi.mocked(prisma.prescription.findMany).mockResolvedValue([
      {
        id: "rx1",
        appointment: {
          patientId: "p1",
          patient: { id: "p1", fullName: "Alice", mrn: "M1", userId: "u1", user: { phone: "1" } },
        },
      },
      {
        id: "rx2",
        appointment: {
          patientId: "p2",
          patient: { id: "p2", fullName: "Bob", mrn: "M2", userId: "u2", user: { phone: "2" } },
        },
      },
    ] as never);

    const patients = await findPatientsForBatch("med1", "BATCH-9");

    expect(patients.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("queries the ledger for this exact batch and medicine — not the inventory row", async () => {
    vi.mocked(prisma.inventoryTransaction.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.prescription.findMany).mockResolvedValue([] as never);

    await findPatientsForBatch("med1", "BATCH-9");

    expect(prisma.inventoryTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          batchNumber: "BATCH-9",
          reason: "dispense",
          prescriptionId: { not: null },
        }),
      }),
    );
  });

  it("returns no patients when nothing in the ledger matches", async () => {
    vi.mocked(prisma.inventoryTransaction.findMany).mockResolvedValue([] as never);

    const patients = await findPatientsForBatch("med1", "NEVER-SOLD");

    expect(patients).toEqual([]);
    expect(prisma.prescription.findMany).not.toHaveBeenCalled();
  });
});
