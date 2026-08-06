import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/db.js";

vi.mock("../config/db", () => {
  const prisma = {
    bill: { findUnique: vi.fn(), update: vi.fn() },
    payment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    patient: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    webhookEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma, prismaDirect: prisma };
});

vi.mock("../config/redis", () => ({ redis: null, getCached: vi.fn(), setCached: vi.fn() }));
vi.mock("../utils/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("./notification.service", () => ({ dispatchNotification: vi.fn() }));
vi.mock("./settings.service", () => ({
  get: vi.fn().mockResolvedValue({ currency: "USD", taxPercentage: new Prisma.Decimal(0) }),
}));

// The gateway SDKs must never be reached from a test.
const verifyWebhook = vi.fn();
vi.mock("./payments/stripe.provider", () => ({
  stripeProvider: {
    name: "stripe",
    createIntent: vi.fn(),
    refund: vi.fn(),
    verifyWebhook: (...args: unknown[]) => verifyWebhook(...args),
  },
}));

const D = Prisma.Decimal;

function p2002() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.0.0",
  });
}

describe("webhook idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyWebhook.mockReturnValue({
      eventId: "evt_123",
      type: "payment_succeeded",
      providerRef: "pi_123",
      amount: "50.00",
    });
  });

  it("processes a first delivery and settles the payment", async () => {
    vi.mocked(prisma.webhookEvent.create).mockResolvedValue({ id: "we-1" } as never);
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      id: "pay-1",
      billId: "bill-1",
      status: "PENDING",
      amount: new D("50.00"),
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: never) =>
      (fn as unknown as (tx: unknown) => unknown)({
        payment: {
          update: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({
            _sum: { amount: new D("50.00"), refundedAmount: new D("0") },
          }),
        },
        bill: {
          findUnique: vi.fn().mockResolvedValue({
            id: "bill-1",
            total: new D("50.00"),
            status: "finalised",
            billNumber: "INV-1",
            patient: { userId: "u1" },
          }),
          update: vi.fn().mockResolvedValue({
            id: "bill-1",
            billNumber: "INV-1",
            balance: new D("0.00"),
          }),
        },
      }),
    );

    const { handleWebhook } = await import("./payment.service.js");
    const result = await handleWebhook("stripe", Buffer.from("{}"), "sig");

    expect(result.status).toBe("settled");
  });

  it("refuses a replayed event without touching the bill", async () => {
    // The unique constraint on (provider, eventId) is the guarantee — a prior
    // SELECT would let two concurrent retries both through.
    vi.mocked(prisma.webhookEvent.create).mockRejectedValue(p2002());

    const { handleWebhook } = await import("./payment.service.js");
    const result = await handleWebhook("stripe", Buffer.from("{}"), "sig");

    expect(result.status).toBe("duplicate");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
  });

  it("does not double-settle a payment already marked SUCCEEDED", async () => {
    vi.mocked(prisma.webhookEvent.create).mockResolvedValue({ id: "we-2" } as never);
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      id: "pay-1",
      billId: "bill-1",
      status: "SUCCEEDED",
      amount: new D("50.00"),
    } as never);

    const { handleWebhook } = await import("./payment.service.js");
    const result = await handleWebhook("stripe", Buffer.from("{}"), "sig");

    expect(result.status).toBe("already_settled");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("records a failed payment without altering the balance", async () => {
    vi.mocked(prisma.webhookEvent.create).mockResolvedValue({ id: "we-3" } as never);
    verifyWebhook.mockReturnValue({
      eventId: "evt_fail",
      type: "payment_failed",
      providerRef: "pi_fail",
      amount: "50.00",
    });
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      id: "pay-2",
      billId: "bill-1",
      status: "PENDING",
      amount: new D("50.00"),
    } as never);
    vi.mocked(prisma.payment.update).mockResolvedValue({ id: "pay-2" } as never);

    const { handleWebhook } = await import("./payment.service.js");
    const result = await handleWebhook("stripe", Buffer.from("{}"), "sig");

    expect(result.status).toBe("failed_recorded");
    expect(prisma.bill.update).not.toHaveBeenCalled();
  });

  it("ignores an event type billing does not act on", async () => {
    vi.mocked(prisma.webhookEvent.create).mockResolvedValue({ id: "we-4" } as never);
    verifyWebhook.mockReturnValue({
      eventId: "evt_other",
      type: "ignored",
      providerRef: null,
      amount: null,
    });

    const { handleWebhook } = await import("./payment.service.js");
    const result = await handleWebhook("stripe", Buffer.from("{}"), "sig");

    expect(result.status).toBe("ignored");
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
  });
});

describe("cash payments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses to take cash against a draft bill", async () => {
    vi.mocked(prisma.bill.findUnique).mockResolvedValue({
      id: "bill-1",
      status: "draft",
      balance: new D("100.00"),
    } as never);

    const { recordCashPayment } = await import("./payment.service.js");
    await expect(
      recordCashPayment(
        { billId: "bill-1", amount: "50.00" },
        { userId: "u1", role: "RECEPTIONIST" },
      ),
    ).rejects.toThrow("Finalise the bill");
  });

  it("refuses an amount larger than the outstanding balance", async () => {
    vi.mocked(prisma.bill.findUnique).mockResolvedValue({
      id: "bill-1",
      status: "finalised",
      balance: new D("40.00"),
    } as never);

    const { recordCashPayment } = await import("./payment.service.js");
    await expect(
      recordCashPayment(
        { billId: "bill-1", amount: "50.00" },
        { userId: "u1", role: "RECEPTIONIST" },
      ),
    ).rejects.toThrow("exceeds the outstanding balance");
  });

  it("refuses payment against an already-paid bill", async () => {
    vi.mocked(prisma.bill.findUnique).mockResolvedValue({
      id: "bill-1",
      status: "paid",
      balance: new D("0.00"),
    } as never);

    const { recordCashPayment } = await import("./payment.service.js");
    await expect(
      recordCashPayment(
        { billId: "bill-1", amount: "10.00" },
        { userId: "u1", role: "RECEPTIONIST" },
      ),
    ).rejects.toThrow("already paid in full");
  });
});

describe("refunds", () => {
  const actor = { userId: "acc1", role: "ACCOUNTANT" };
  const settledPayment = (over: Partial<Record<string, unknown>> = {}) =>
    ({
      id: "pay-1",
      billId: "bill-1",
      status: "SUCCEEDED",
      amount: new D("50.00"),
      refundedAmount: new D("0"),
      provider: "stripe",
      providerRef: "pi_123",
      bill: { total: new D("50.00"), status: "finalised" },
      ...over,
    }) as never;

  beforeEach(() => vi.clearAllMocks());

  it("refuses to refund a payment that never settled", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(settledPayment({ status: "PENDING" }));

    const { refundPayment } = await import("./payment.service.js");
    await expect(
      refundPayment("pay-1", { amount: "10.00", reason: "overcharged" }, actor),
    ).rejects.toThrow("settled payment");
  });

  it("refuses a second refund after the payment is fully refunded", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(
      settledPayment({ refundedAmount: new D("50.00") }),
    );

    const { refundPayment } = await import("./payment.service.js");
    await expect(refundPayment("pay-1", { reason: "already refunded" }, actor)).rejects.toThrow(
      "already been fully refunded",
    );
  });

  it("refuses an amount larger than what remains refundable", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(
      settledPayment({ refundedAmount: new D("40.00") }),
    );

    const { refundPayment } = await import("./payment.service.js");
    await expect(refundPayment("pay-1", { amount: "20.00", reason: "x" }, actor)).rejects.toThrow(
      "exceeds the refundable amount",
    );
  });

  it("sends card refunds back through the gateway and audits them", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(settledPayment());
    const { stripeProvider } = await import("./payments/stripe.provider.js");
    vi.mocked(stripeProvider.refund).mockResolvedValue({ refundRef: "re_1", amount: "50.00" });

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: never) =>
      (fn as unknown as (tx: unknown) => unknown)({
        payment: {
          update: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({
            _sum: { amount: new D("50.00"), refundedAmount: new D("50.00") },
          }),
        },
        bill: {
          update: vi.fn().mockResolvedValue({ id: "bill-1", balance: new D("50.00") }),
        },
      }),
    );

    const { refundPayment } = await import("./payment.service.js");
    const { writeAuditLog } = await import("../utils/audit.js");
    await refundPayment("pay-1", { reason: "patient dispute" }, actor);

    expect(stripeProvider.refund).toHaveBeenCalledWith({
      providerRef: "pi_123",
      amount: "50.00",
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYMENT_REFUNDED",
        targetId: "pay-1",
        actorUserId: "acc1",
      }),
    );
  });

  it("records a cash refund without touching the gateway", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(
      settledPayment({ provider: null, providerRef: null }),
    );

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: never) =>
      (fn as unknown as (tx: unknown) => unknown)({
        payment: {
          update: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({
            _sum: { amount: new D("50.00"), refundedAmount: new D("20.00") },
          }),
        },
        bill: {
          update: vi.fn().mockResolvedValue({ id: "bill-1", balance: new D("20.00") }),
        },
      }),
    );

    const { refundPayment } = await import("./payment.service.js");
    const { stripeProvider } = await import("./payments/stripe.provider.js");

    await refundPayment("pay-1", { amount: "20.00", reason: "cash" }, actor);

    expect(stripeProvider.refund).not.toHaveBeenCalled();
  });
});
