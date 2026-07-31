import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/db.js";

vi.mock("../config/db", () => ({
  prisma: {
    bill: { findUnique: vi.fn(), update: vi.fn() },
    discount: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    patientInsurance: { findFirst: vi.fn() },
  },
}));

vi.mock("../config/redis", () => ({ redis: null, getCached: vi.fn(), setCached: vi.fn() }));
vi.mock("../utils/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("./settings.service", () => ({
  get: vi.fn().mockResolvedValue({ currency: "USD", taxPercentage: new Prisma.Decimal(0) }),
}));

const D = Prisma.Decimal;

const draftBill = {
  id: "bill-1",
  status: "draft",
  discountId: null,
  patientId: "p1",
  amountPaid: new D("0"),
  items: [{ quantity: 1, unitPrice: new D("100.00") }],
};

describe("applyDiscountToBill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.patientInsurance.findFirst).mockResolvedValue(null as never);
  });

  it("applies a valid discount and recomputes the total", async () => {
    vi.mocked(prisma.bill.findUnique).mockResolvedValue(draftBill as never);
    vi.mocked(prisma.discount.findUnique).mockResolvedValue({
      id: "d1",
      name: "Senior citizen",
      type: "percentage",
      value: new D("10"),
      isActive: true,
      validFrom: null,
      validUntil: null,
    } as never);
    vi.mocked(prisma.bill.update).mockResolvedValue({ id: "bill-1" } as never);

    const { applyDiscountToBill } = await import("./discount.service.js");
    await applyDiscountToBill("bill-1", { discountId: "d1" }, { userId: "u1", role: "ADMIN" });

    const data = vi.mocked(prisma.bill.update).mock.calls[0]![0]!.data as {
      discountAmount: Prisma.Decimal;
      total: Prisma.Decimal;
    };
    expect(data.discountAmount.toFixed(2)).toBe("10.00");
    expect(data.total.toFixed(2)).toBe("90.00");
  });

  it("rejects stacking a second discount on the same bill", async () => {
    vi.mocked(prisma.bill.findUnique).mockResolvedValue({
      ...draftBill,
      discountId: "already-applied",
    } as never);

    const { applyDiscountToBill } = await import("./discount.service.js");
    await expect(
      applyDiscountToBill("bill-1", { discountId: "d2" }, { userId: "u1", role: "ADMIN" }),
    ).rejects.toThrow("do not stack");

    expect(prisma.bill.update).not.toHaveBeenCalled();
  });

  it("rejects an expired discount", async () => {
    vi.mocked(prisma.bill.findUnique).mockResolvedValue(draftBill as never);
    vi.mocked(prisma.discount.findUnique).mockResolvedValue({
      id: "d1",
      isActive: true,
      validFrom: null,
      validUntil: new Date("2020-01-01"),
      type: "percentage",
      value: new D("10"),
    } as never);

    const { applyDiscountToBill } = await import("./discount.service.js");
    await expect(
      applyDiscountToBill("bill-1", { discountId: "d1" }, { userId: "u1", role: "ADMIN" }),
    ).rejects.toThrow("expired");
  });

  it("rejects a deactivated discount", async () => {
    vi.mocked(prisma.bill.findUnique).mockResolvedValue(draftBill as never);
    vi.mocked(prisma.discount.findUnique).mockResolvedValue({
      id: "d1",
      isActive: false,
      validFrom: null,
      validUntil: null,
      type: "percentage",
      value: new D("10"),
    } as never);

    const { applyDiscountToBill } = await import("./discount.service.js");
    await expect(
      applyDiscountToBill("bill-1", { discountId: "d1" }, { userId: "u1", role: "ADMIN" }),
    ).rejects.toThrow("no longer active");
  });

  it("refuses to discount a bill that is no longer a draft", async () => {
    vi.mocked(prisma.bill.findUnique).mockResolvedValue({
      ...draftBill,
      status: "finalised",
    } as never);

    const { applyDiscountToBill } = await import("./discount.service.js");
    await expect(
      applyDiscountToBill("bill-1", { discountId: "d1" }, { userId: "u1", role: "ADMIN" }),
    ).rejects.toThrow("draft bill");
  });
});
