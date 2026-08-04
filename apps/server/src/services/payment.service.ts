import { Prisma } from "@prisma/client";
import PDFDocument from "pdfkit";
import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import { dispatchNotification } from "./notification.service.js";
import * as settingsService from "./settings.service.js";
import { BILL_STATUS, assertCanAccessBill, deriveStatus, type Actor } from "./bill.service.js";
import { stripeProvider } from "./payments/stripe.provider.js";
import type { PaymentProvider } from "./payments/PaymentProvider.js";
import type {
  CashPaymentInput,
  CreateIntentInput,
  PaymentHistoryInput,
  RefundInput,
} from "@healvista/shared";

const D = Prisma.Decimal;

const providers: Record<string, PaymentProvider> = {
  stripe: stripeProvider,
};

function getProvider(name: string): PaymentProvider {
  const provider = providers[name];
  if (!provider) throw new AppError(`Unknown payment provider: ${name}`, 400);
  return provider;
}

/** A bill must be finalised before money can be taken against it. */
function assertPayable(bill: { status: string; balance: Prisma.Decimal }) {
  if (bill.status === BILL_STATUS.DRAFT) {
    throw new AppError("Finalise the bill before taking payment", 409);
  }
  if (bill.status === BILL_STATUS.VOID) {
    throw new AppError("This bill has been voided", 409);
  }
  if (bill.balance.lessThanOrEqualTo(0)) {
    throw new AppError("This bill is already paid in full", 409);
  }
}

/**
 * Records a payment and recomputes the bill in one transaction.
 *
 * This is the only place `amountPaid`, `balance`, and `status` are written. Doing it
 * anywhere else risks a bill whose stated balance disagrees with its payment rows —
 * which, in billing, is the bug that costs real money.
 */
async function recordPayment(params: {
  billId: string;
  amount: Prisma.Decimal;
  method: "CARD" | "CASH" | "BANK_TRANSFER" | "WALLET" | "INSURANCE";
  status?: "PENDING" | "SUCCEEDED" | "FAILED";
  provider?: string | null;
  providerRef?: string | null;
  receivedById?: string | null;
  reference?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findUnique({
      where: { id: params.billId },
      include: { patient: { select: { userId: true, fullName: true } } },
    });
    if (!bill) throw new AppError("Bill not found", 404);

    const payment = await tx.payment.create({
      data: {
        billId: params.billId,
        amount: params.amount,
        method: params.method,
        status: params.status ?? "SUCCEEDED",
        provider: params.provider ?? null,
        providerRef: params.providerRef ?? null,
        receivedById: params.receivedById ?? null,
        reference: params.reference ?? null,
      },
    });

    // Sum only settled money — a PENDING or FAILED row must not reduce the balance.
    const settled = await tx.payment.aggregate({
      where: { billId: params.billId, status: "SUCCEEDED" },
      _sum: { amount: true, refundedAmount: true },
    });
    const amountPaid = (settled._sum.amount ?? new D(0)).minus(
      settled._sum.refundedAmount ?? new D(0),
    );
    const balance = bill.total.minus(amountPaid);

    const updatedBill = await tx.bill.update({
      where: { id: params.billId },
      data: {
        amountPaid,
        balance,
        status: deriveStatus(bill.total, amountPaid, bill.status),
      },
      include: { items: true, payments: true, discount: true },
    });

    return { payment, bill: updatedBill, patient: bill.patient };
  });
}

export async function createIntent(input: CreateIntentInput, actor: Actor) {
  await assertCanAccessBill(input.billId, actor);

  const bill = await prisma.bill.findUnique({
    where: { id: input.billId },
    include: { patient: { select: { user: { select: { email: true } } } } },
  });
  if (!bill) throw new AppError("Bill not found", 404);
  assertPayable(bill);

  const amount = input.amount ? new D(input.amount) : bill.balance;
  if (amount.lessThanOrEqualTo(0)) throw new AppError("Amount must be positive", 400);
  if (amount.greaterThan(bill.balance)) {
    throw new AppError("Amount exceeds the outstanding balance on this bill", 400);
  }

  const settings = (await settingsService.get()) as { currency: string };
  const provider = getProvider(input.provider);

  const intent = await provider.createIntent({
    amount: amount.toFixed(2),
    currency: settings.currency,
    billId: bill.id,
    patientEmail: bill.patient.user?.email,
  });

  // Recorded as PENDING now; the webhook is what promotes it to SUCCEEDED. The
  // client returning "success" is a hint, never the source of truth.
  await prisma.payment.create({
    data: {
      billId: bill.id,
      amount,
      method: "CARD",
      status: "PENDING",
      provider: provider.name,
      providerRef: intent.providerRef,
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "PAYMENT_INTENT_CREATED",
    targetType: "bill",
    targetId: bill.id,
    metadata: { provider: provider.name, amount: amount.toString() },
  });

  return intent;
}

/**
 * Cash taken at the desk. `receivedById` is mandatory and comes from the session,
 * never the request body — an untraceable cash payment is an accounting hole.
 */
export async function recordCashPayment(input: CashPaymentInput, actor: Actor) {
  const bill = await prisma.bill.findUnique({ where: { id: input.billId } });
  if (!bill) throw new AppError("Bill not found", 404);
  assertPayable(bill);

  const amount = new D(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw new AppError("Amount must be positive", 400);
  if (amount.greaterThan(bill.balance)) {
    throw new AppError("Amount exceeds the outstanding balance on this bill", 400);
  }

  const {
    payment,
    bill: updated,
    patient,
  } = await recordPayment({
    billId: input.billId,
    amount,
    method: "CASH",
    status: "SUCCEEDED",
    receivedById: actor.userId,
    reference: input.reference ?? null,
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "PAYMENT_CASH_RECEIVED",
    targetType: "payment",
    targetId: payment.id,
    metadata: {
      billId: input.billId,
      amount: amount.toString(),
      balanceAfter: updated.balance.toString(),
    },
  });

  await notifyReceipt(patient.userId, updated, amount);

  return { payment, bill: updated };
}

async function notifyReceipt(
  userId: string,
  bill: { billNumber: string; balance: Prisma.Decimal },
  amount: Prisma.Decimal,
) {
  try {
    await dispatchNotification({
      userId,
      type: "PAYMENT_RECEIPT",
      title: "Payment received",
      message: `We received ${amount.toFixed(2)} for invoice ${bill.billNumber}. Outstanding balance: ${bill.balance.toFixed(2)}.`,
      data: {
        amount: amount.toFixed(2),
        description: `Invoice ${bill.billNumber}`,
        receiptUrl: "",
      },
    });
  } catch (err) {
    // A notification failure must never roll back a recorded payment.
    console.error("[payment] receipt notification failed:", err);
  }
}

/**
 * Handles a verified webhook exactly once.
 *
 * Idempotency is enforced by the unique constraint on (provider, eventId), not by a
 * prior SELECT — two concurrent retries would both pass a read check, and only the
 * database can arbitrate that race.
 */
export async function handleWebhook(providerName: string, rawBody: Buffer, signature: string) {
  const provider = getProvider(providerName);
  const event = provider.verifyWebhook(rawBody, signature);

  try {
    await prisma.webhookEvent.create({
      data: { provider: provider.name, eventId: event.eventId, eventType: event.type },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { status: "duplicate", eventId: event.eventId };
    }
    throw err;
  }

  if (event.type === "ignored" || !event.providerRef) {
    return { status: "ignored", eventId: event.eventId };
  }

  const pending = await prisma.payment.findUnique({
    where: {
      provider_providerRef: { provider: provider.name, providerRef: event.providerRef },
    },
  });
  if (!pending) return { status: "unknown_payment", eventId: event.eventId };

  if (event.type === "payment_failed") {
    await prisma.payment.update({ where: { id: pending.id }, data: { status: "FAILED" } });
    return { status: "failed_recorded", eventId: event.eventId };
  }

  if (event.type === "payment_succeeded") {
    if (pending.status === "SUCCEEDED") {
      return { status: "already_settled", eventId: event.eventId };
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: pending.id }, data: { status: "SUCCEEDED" } });

      const bill = await tx.bill.findUnique({
        where: { id: pending.billId },
        include: { patient: { select: { userId: true } } },
      });
      if (!bill) throw new AppError("Bill not found", 404);

      const settled = await tx.payment.aggregate({
        where: { billId: pending.billId, status: "SUCCEEDED" },
        _sum: { amount: true, refundedAmount: true },
      });
      const amountPaid = (settled._sum.amount ?? new D(0)).minus(
        settled._sum.refundedAmount ?? new D(0),
      );

      const updated = await tx.bill.update({
        where: { id: pending.billId },
        data: {
          amountPaid,
          balance: bill.total.minus(amountPaid),
          status: deriveStatus(bill.total, amountPaid, bill.status),
        },
      });

      return { bill: updated, patientUserId: bill.patient.userId };
    });

    await notifyReceipt(result.patientUserId, result.bill, pending.amount);
    return { status: "settled", eventId: event.eventId };
  }

  return { status: "ignored", eventId: event.eventId };
}

export async function refundPayment(paymentId: string, input: RefundInput, actor: Actor) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { bill: true },
  });
  if (!payment) throw new AppError("Payment not found", 404);
  if (payment.status !== "SUCCEEDED") {
    throw new AppError("Only a settled payment can be refunded", 409);
  }

  const refundable = payment.amount.minus(payment.refundedAmount);
  if (refundable.lessThanOrEqualTo(0)) {
    throw new AppError("This payment has already been fully refunded", 409);
  }

  const amount = input.amount ? new D(input.amount) : refundable;
  if (amount.lessThanOrEqualTo(0)) throw new AppError("Refund amount must be positive", 400);
  if (amount.greaterThan(refundable)) {
    throw new AppError("Refund exceeds the refundable amount on this payment", 400);
  }

  // Card refunds go back through the gateway; cash is handed over at the desk and
  // only recorded here.
  let refundRef: string | null = null;
  if (payment.provider && payment.providerRef) {
    const result = await getProvider(payment.provider).refund({
      providerRef: payment.providerRef,
      amount: amount.toFixed(2),
    });
    refundRef = result.refundRef;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const totalRefunded = payment.refundedAmount.plus(amount);

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        refundedAmount: totalRefunded,
        refundedAt: new Date(),
        refundRef,
        status: totalRefunded.greaterThanOrEqualTo(payment.amount) ? "REFUNDED" : "SUCCEEDED",
      },
    });

    const settled = await tx.payment.aggregate({
      where: { billId: payment.billId, status: { in: ["SUCCEEDED", "REFUNDED"] } },
      _sum: { amount: true, refundedAmount: true },
    });
    const amountPaid = (settled._sum.amount ?? new D(0)).minus(
      settled._sum.refundedAmount ?? new D(0),
    );

    return tx.bill.update({
      where: { id: payment.billId },
      data: {
        amountPaid,
        balance: payment.bill.total.minus(amountPaid),
        status: deriveStatus(payment.bill.total, amountPaid, payment.bill.status),
      },
      include: { payments: true },
    });
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "PAYMENT_REFUNDED",
    targetType: "payment",
    targetId: paymentId,
    metadata: {
      billId: payment.billId,
      amount: amount.toString(),
      reason: input.reason,
      refundRef,
    },
  });

  return updated;
}

const PAYMENT_STAFF_ROLES = ["ACCOUNTANT", "RECEPTIONIST", "ADMIN"];

export async function getPaymentHistory(filters: PaymentHistoryInput, actor: Actor) {
  const where: Prisma.PaymentWhereInput = {};

  // Patients see their own payments only; the requested patientId cannot widen that.
  if (!PAYMENT_STAFF_ROLES.includes(actor.role)) {
    if (actor.role !== "PATIENT") throw new AppError("Not authorised to view payments", 403);
    const patient = await prisma.patient.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (!patient) throw new AppError("Patient record not found", 404);
    where.bill = { patientId: patient.id };
  } else if (filters.patientId) {
    where.bill = { patientId: filters.patientId };
  }

  if (filters.billId) where.billId = filters.billId;
  if (filters.method) where.method = filters.method;
  if (filters.fromDate || filters.toDate) {
    where.createdAt = {};
    if (filters.fromDate) where.createdAt.gte = new Date(filters.fromDate);
    if (filters.toDate) where.createdAt.lte = new Date(filters.toDate);
  }

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        bill: {
          select: {
            id: true,
            billNumber: true,
            patient: { select: { id: true, fullName: true, mrn: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.payment.count({ where }),
  ]);

  // Resolve cashier names in one query rather than N.
  const cashierIds = [...new Set(payments.map((p) => p.receivedById).filter(Boolean))] as string[];
  const cashiers = cashierIds.length
    ? await prisma.user.findMany({
        where: { id: { in: cashierIds } },
        select: { id: true, email: true },
      })
    : [];
  const cashierById = new Map(cashiers.map((c) => [c.id, c.email]));

  return {
    payments: payments.map((p) => ({
      ...p,
      receivedByEmail: p.receivedById ? (cashierById.get(p.receivedById) ?? null) : null,
    })),
    total,
    page: filters.page,
    limit: filters.limit,
  };
}

export async function generateReceiptPdf(paymentId: string, actor: Actor) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      bill: { include: { patient: { select: { fullName: true, mrn: true } } } },
    },
  });
  if (!payment) throw new AppError("Payment not found", 404);
  await assertCanAccessBill(payment.billId, actor);

  const settings = (await settingsService.get()) as { name: string; currency: string };
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  doc.fontSize(20).text(settings.name, { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(14).text("Payment Receipt", { align: "center" });
  doc.moveDown(1.5);

  const line = (label: string, value: string) => {
    doc.fontSize(10).fillColor("#666").text(label, { continued: true });
    doc.fillColor("#000").text(`  ${value}`);
    doc.moveDown(0.4);
  };

  line("Receipt no", payment.id);
  line("Invoice", payment.bill.billNumber);
  line("Patient", `${payment.bill.patient.fullName} (MRN ${payment.bill.patient.mrn})`);
  line("Date", payment.createdAt.toISOString().replace("T", " ").slice(0, 16));
  line("Method", payment.method);
  if (payment.reference) line("Reference", payment.reference);
  doc.moveDown(0.5);
  line("Amount paid", `${settings.currency} ${payment.amount.toFixed(2)}`);
  if (payment.refundedAmount.greaterThan(0)) {
    line("Refunded", `${settings.currency} ${payment.refundedAmount.toFixed(2)}`);
  }
  line("Invoice balance", `${settings.currency} ${payment.bill.balance.toFixed(2)}`);

  doc.end();
  return { doc, filename: `receipt-${payment.id}.pdf` };
}
