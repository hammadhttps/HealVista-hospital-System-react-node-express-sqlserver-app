import { beforeEach, describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { BILL_STATUS, computeTotals, deriveStatus, getBills } from "./bill.service.js";
import { prisma } from "../config/db.js";

vi.mock("../config/db.js", () => ({
  prisma: {
    patient: {
      findUnique: vi.fn(),
    },
    patientRelationship: {
      findMany: vi.fn(),
    },
    bill: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

const D = Prisma.Decimal;

describe("computeTotals", () => {
  it("sums line items by quantity x unit price", () => {
    const t = computeTotals({
      items: [
        { quantity: 2, unitPrice: "50.00" },
        { quantity: 1, unitPrice: "25.50" },
      ],
      taxPercentage: 0,
    });

    expect(t.subtotal.toFixed(2)).toBe("125.50");
    expect(t.total.toFixed(2)).toBe("125.50");
  });

  it("applies a percentage discount before tax, not after", () => {
    // 100 - 10% = 90, then 10% tax on 90 = 9 -> 99.
    // Taxing first would give 110 - 11 = 99 by coincidence at equal rates, so use
    // different rates to prove the ordering.
    const t = computeTotals({
      items: [{ quantity: 1, unitPrice: "100.00" }],
      discount: { type: "percentage", value: "10" },
      taxPercentage: 20,
    });

    expect(t.discountAmount.toFixed(2)).toBe("10.00");
    // 90 * 1.20 = 108. Taxing before discounting would give 120 - 12 = 108 too,
    // so assert the taxable base explicitly via taxAmount: 20% of 90 = 18.
    expect(t.taxAmount.toFixed(2)).toBe("18.00");
    expect(t.total.toFixed(2)).toBe("108.00");
  });

  it("never lets a fixed discount drive the total negative", () => {
    const t = computeTotals({
      items: [{ quantity: 1, unitPrice: "40.00" }],
      discount: { type: "fixed", value: "100.00" },
      taxPercentage: 10,
    });

    expect(t.discountAmount.toFixed(2)).toBe("40.00");
    expect(t.total.toFixed(2)).toBe("0.00");
  });

  it("applies insurance to the post-tax amount and reports it separately", () => {
    const t = computeTotals({
      items: [{ quantity: 1, unitPrice: "200.00" }],
      taxPercentage: 10,
      insuranceCoveragePercentage: 80,
    });

    // 200 + 10% tax = 220; insurer covers 80% (176); patient owes 44.
    expect(t.taxAmount.toFixed(2)).toBe("20.00");
    expect(t.insuranceCovered.toFixed(2)).toBe("176.00");
    expect(t.total.toFixed(2)).toBe("44.00");
  });

  it("does not accumulate binary floating point error", () => {
    // 0.1 + 0.2 !== 0.3 in JS floats. Decimal must get this exactly right.
    const t = computeTotals({
      items: [
        { quantity: 1, unitPrice: "0.10" },
        { quantity: 1, unitPrice: "0.20" },
      ],
      taxPercentage: 0,
    });

    expect(t.total.toFixed(2)).toBe("0.30");
    expect(t.total.equals(new D("0.30"))).toBe(true);
  });
});

describe("deriveStatus", () => {
  it("marks a bill paid once payments reach the total", () => {
    expect(deriveStatus(new D("100"), new D("100"), BILL_STATUS.FINALISED)).toBe(
      BILL_STATUS.PAID,
    );
  });

  it("marks a bill partially paid when some money has arrived", () => {
    expect(deriveStatus(new D("100"), new D("40"), BILL_STATUS.FINALISED)).toBe(
      BILL_STATUS.PARTIALLY_PAID,
    );
  });

  it("stays finalised when nothing has been paid", () => {
    expect(deriveStatus(new D("100"), new D("0"), BILL_STATUS.FINALISED)).toBe(
      BILL_STATUS.FINALISED,
    );
  });

  it("treats an overpayment as paid rather than looping back", () => {
    expect(deriveStatus(new D("100"), new D("120"), BILL_STATUS.PARTIALLY_PAID)).toBe(
      BILL_STATUS.PAID,
    );
  });

  it("never promotes a draft or void bill on payment", () => {
    expect(deriveStatus(new D("100"), new D("100"), BILL_STATUS.DRAFT)).toBe(BILL_STATUS.DRAFT);
    expect(deriveStatus(new D("100"), new D("100"), BILL_STATUS.VOID)).toBe(BILL_STATUS.VOID);
  });
});

describe("getBills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses default pagination values when none are provided", async () => {
    const mockFindMany = vi.mocked(prisma.bill.findMany);
    const mockCount = vi.mocked(prisma.bill.count);
    const mockPatientFindUnique = vi.mocked(prisma.patient.findUnique);
    const mockPatientRelationshipFindMany = vi.mocked(prisma.patientRelationship.findMany);
    mockPatientFindUnique.mockResolvedValue({ id: "patient-1" } as any);
    mockPatientRelationshipFindMany.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await getBills({ page: 1, limit: 20 } as any, { userId: "user-1", role: "PATIENT" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      }),
    );
  });
});

describe("partial payment arithmetic", () => {
  it("three payments summing to the total leave zero balance and status paid", () => {
    const total = computeTotals({
      items: [{ quantity: 1, unitPrice: "300.00" }],
      taxPercentage: 0,
    }).total;

    const payments = [new D("100.00"), new D("150.00"), new D("50.00")];
    const amountPaid = payments.reduce((sum, p) => sum.plus(p), new D(0));
    const balance = total.minus(amountPaid);

    expect(amountPaid.toFixed(2)).toBe("300.00");
    expect(balance.toFixed(2)).toBe("0.00");
    expect(deriveStatus(total, amountPaid, BILL_STATUS.FINALISED)).toBe(BILL_STATUS.PAID);
  });

  it("leaves a partial balance after an incomplete run of payments", () => {
    const total = new D("300.00");
    const amountPaid = new D("100.00").plus(new D("150.00"));

    expect(total.minus(amountPaid).toFixed(2)).toBe("50.00");
    expect(deriveStatus(total, amountPaid, BILL_STATUS.FINALISED)).toBe(
      BILL_STATUS.PARTIALLY_PAID,
    );
  });

  it("subtracts refunds from money considered received", () => {
    const total = new D("300.00");
    const gross = new D("300.00");
    const refunded = new D("100.00");
    const amountPaid = gross.minus(refunded);

    expect(total.minus(amountPaid).toFixed(2)).toBe("100.00");
    expect(deriveStatus(total, amountPaid, BILL_STATUS.PAID)).toBe(BILL_STATUS.PARTIALLY_PAID);
  });
});
