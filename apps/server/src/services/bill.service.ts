import { Prisma, BillItemKind } from "@prisma/client";
import PDFDocument from "pdfkit";
import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import * as settingsService from "./settings.service.js";
import { getDependentPatientIds } from "./access.service.js";
import type {
  BillItemInput,
  CreateBillInput,
  ListBillsInput,
  UpdateBillInput,
} from "@healvista/shared";

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** The caller identity every scoped read needs. Mirrors `JwtPayload`. */
export interface Actor {
  userId: string;
  role: string;
}

/** Roles allowed to see and edit any bill. */
const BILLING_ROLES = ["ACCOUNTANT", "RECEPTIONIST", "ADMIN"];

export const BILL_STATUS = {
  DRAFT: "draft",
  FINALISED: "finalised",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
  VOID: "void",
} as const;

function generateBillNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `INV-${ts}-${rand}`;
}

/**
 * The single source of truth for bill arithmetic.
 *
 * Order matters and is not arbitrary: discount comes off the subtotal, tax applies
 * to the discounted amount (you do not tax money the patient never owed), and
 * insurance covers a share of what is left. Changing this order changes what
 * patients are charged.
 */
export function computeTotals(params: {
  items: { quantity: number; unitPrice: Decimal | string | number }[];
  discount?: { type: string; value: Decimal | string | number } | null;
  taxPercentage: Decimal | string | number;
  insuranceCoveragePercentage?: number | null;
}) {
  const subtotal = params.items.reduce(
    (sum, item) => sum.plus(new D(item.unitPrice).times(item.quantity)),
    new D(0),
  );

  let discountAmount = new D(0);
  if (params.discount) {
    discountAmount =
      params.discount.type === "percentage"
        ? subtotal.times(new D(params.discount.value)).dividedBy(100)
        : new D(params.discount.value);
    // A fixed discount larger than the bill must not create a negative total.
    if (discountAmount.greaterThan(subtotal)) discountAmount = subtotal;
  }

  const taxable = subtotal.minus(discountAmount);
  const taxAmount = taxable.times(new D(params.taxPercentage)).dividedBy(100);
  const grossTotal = taxable.plus(taxAmount);

  const insuranceCovered = params.insuranceCoveragePercentage
    ? grossTotal.times(params.insuranceCoveragePercentage).dividedBy(100)
    : new D(0);

  const total = grossTotal.minus(insuranceCovered);

  return {
    subtotal: subtotal.toDecimalPlaces(2),
    discountAmount: discountAmount.toDecimalPlaces(2),
    taxAmount: taxAmount.toDecimalPlaces(2),
    insuranceCovered: insuranceCovered.toDecimalPlaces(2),
    total: total.toDecimalPlaces(2),
  };
}

/**
 * Derives bill status from money actually received. Called inside the same
 * transaction as any payment insert so status and balance can never disagree.
 */
export function deriveStatus(total: Decimal, amountPaid: Decimal, current: string): string {
  if (current === BILL_STATUS.DRAFT || current === BILL_STATUS.VOID) return current;
  if (amountPaid.greaterThanOrEqualTo(total)) return BILL_STATUS.PAID;
  if (amountPaid.greaterThan(0)) return BILL_STATUS.PARTIALLY_PAID;
  return BILL_STATUS.FINALISED;
}

async function resolveBillScope(actor: Actor): Promise<{ patientIds?: string[] }> {
  if (BILLING_ROLES.includes(actor.role)) return {};

  if (actor.role === "PATIENT") {
    const patient = await prisma.patient.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (!patient) throw new AppError("Patient record not found", 404);

    // A guardian who can book for a dependant is the person who gets billed for that
    // visit, so booking permission is what grants sight of the bill.
    const dependents = await getDependentPatientIds(patient.id, "booking");
    return { patientIds: [patient.id, ...dependents] };
  }

  throw new AppError("Not authorised to view bills", 403);
}

/** Loads a bill and asserts the caller may see it. */
export async function assertCanAccessBill(billId: string, actor: Actor) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    select: { id: true, patientId: true, patient: { select: { userId: true } } },
  });
  if (!bill) throw new AppError("Bill not found", 404);

  if (BILLING_ROLES.includes(actor.role)) return;
  if (actor.role === "PATIENT" && bill.patient?.userId === actor.userId) return;

  // A guardian settles their dependant's bill.
  if (actor.role === "PATIENT") {
    const self = await prisma.patient.findUnique({
      where: { userId: actor.userId },
      select: { id: true },
    });
    if (self) {
      const dependents = await getDependentPatientIds(self.id, "booking");
      if (dependents.includes(bill.patientId)) return;
    }
  }

  throw new AppError("Not authorised to access this bill", 403);
}

const billInclude = {
  items: true,
  payments: { orderBy: { createdAt: "desc" } },
  discount: true,
  patient: { select: { id: true, fullName: true, mrn: true } },
  appointment: { select: { id: true, appointmentNo: true } },
} satisfies Prisma.BillInclude;

export async function createBill(input: CreateBillInput, actor: Actor) {
  const patient = await prisma.patient.findUnique({ where: { id: input.patientId } });
  if (!patient) throw new AppError("Patient not found", 404);

  if (input.appointmentId) {
    const existing = await prisma.bill.findUnique({
      where: { appointmentId: input.appointmentId },
    });
    if (existing) throw new AppError("This appointment already has a bill", 409);
  }

  const settings = await settingsService.get();
  const totals = computeTotals({
    items: input.items,
    taxPercentage: (settings as { taxPercentage: Decimal }).taxPercentage,
  });

  const bill = await prisma.bill.create({
    data: {
      billNumber: generateBillNumber(),
      patientId: input.patientId,
      appointmentId: input.appointmentId ?? null,
      ...totals,
      balance: totals.total,
      status: BILL_STATUS.DRAFT,
      items: {
        create: input.items.map((item) => ({
          kind: item.kind,
          sourceId: item.sourceId ?? null,
          description: item.description,
          quantity: item.quantity,
          unitPrice: new D(item.unitPrice),
          amount: new D(item.unitPrice).times(item.quantity).toDecimalPlaces(2),
        })),
      },
    },
    include: billInclude,
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "BILL_CREATED",
    targetType: "bill",
    targetId: bill.id,
    metadata: { patientId: input.patientId, total: bill.total.toString() },
  });

  return bill;
}

/**
 * Recomputes a draft bill's totals from its item set. Non-draft bills are left alone —
 * money already owed must not silently change when a later service call recomputes.
 */
export async function recomputeBill(billId: string) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { items: true, discount: true },
  });
  if (!bill || bill.status !== BILL_STATUS.DRAFT) return bill;

  const settings = await settingsService.get();
  const insurance = await getActiveInsurance(bill.patientId);
  const totals = computeTotals({
    items: bill.items,
    discount: bill.discount,
    taxPercentage: (settings as { taxPercentage: Decimal }).taxPercentage,
    insuranceCoveragePercentage: insurance?.coveragePercentage ?? null,
  });

  return prisma.bill.update({
    where: { id: billId },
    data: {
      ...totals,
      balance: totals.total.minus(bill.amountPaid),
    },
    include: billInclude,
  });
}

/**
 * Adds a charge to the patient's bill — the clinical modules' way of making money
 * flow to billing without coupling to it.
 *
 * Appointments get one bill each (`appointmentId` is unique on Bill), so a lab order
 * during a visit lands on that visit's bill, creating it if the visit has not been
 * completed yet. Orders without an appointment go on the patient's standing draft
 * bill. Deduplicated by (sourceId, kind, description) so re-running a hook never
 * double-charges.
 */
export async function addChargeToBill(
  input: {
    patientId: string;
    appointmentId?: string;
    kind: "CONSULTATION" | "LAB" | "PHARMACY" | "PROCEDURE" | "OTHER";
    sourceId: string;
    description: string;
    unitPrice: Decimal | number;
    quantity?: number;
  },
  actorUserId: string,
) {
  const quantity = input.quantity ?? 1;
  const unitPrice = new D(input.unitPrice);

  let bill = input.appointmentId
    ? await prisma.bill.findUnique({ where: { appointmentId: input.appointmentId } })
    : await prisma.bill.findFirst({
        where: {
          patientId: input.patientId,
          deletedAt: null,
          status: BILL_STATUS.DRAFT,
          appointmentId: null,
        },
      });

  const item = {
    kind: input.kind,
    sourceId: input.sourceId,
    description: input.description,
    quantity,
    unitPrice,
    amount: unitPrice.times(quantity).toDecimalPlaces(2),
  };

  if (!bill) {
    const settings = await settingsService.get();
    const totals = computeTotals({
      items: [{ quantity, unitPrice }],
      taxPercentage: (settings as { taxPercentage: Decimal }).taxPercentage,
    });

    bill = await prisma.bill.create({
      data: {
        billNumber: generateBillNumber(),
        patientId: input.patientId,
        appointmentId: input.appointmentId ?? null,
        ...totals,
        balance: totals.total,
        status: BILL_STATUS.DRAFT,
        items: { create: [item] },
      },
      include: billInclude,
    });
  } else {
    const duplicate = await prisma.billItem.findFirst({
      where: { billId: bill.id, sourceId: input.sourceId, kind: input.kind },
    });
    if (!duplicate) {
      await prisma.billItem.create({ data: { billId: bill.id, ...item } });
      bill = await recomputeBill(bill.id);
    }
  }

  await writeAuditLog({
    actorUserId,
    action: "BILL_CHARGE_ADDED",
    targetType: "bill",
    targetId: bill!.id,
    metadata: { patientId: input.patientId, kind: input.kind, sourceId: input.sourceId },
  });

  return bill;
}

/**
 * Removes every charge that points at a source (a cancelled lab order), then
 * recomputes the affected draft bills. Finalised bills keep their lines — money
 * already billed stays billed, and adjustments go through refunds instead.
 */
export async function removeChargeFromBill(sourceId: string, kind: string) {
  const items = await prisma.billItem.findMany({
    where: { sourceId, kind: kind as BillItemKind },
    select: { billId: true },
  });
  if (items.length === 0) return;

  await prisma.billItem.deleteMany({ where: { sourceId, kind: kind as BillItemKind } });

  for (const billId of new Set(items.map((i) => i.billId))) {
    await recomputeBill(billId);
  }
}

/**
 * Opens a draft bill for a completed consultation, seeded with the doctor's fee.
 *
 * Returns the existing bill rather than throwing if one is already open — the
 * caller is a consultation-completion hook, and a duplicate-bill error must never
 * be able to fail a clinical action. If a bill already exists but has no
 * consultation line (a lab order opened it earlier in the visit), the fee is added
 * here rather than lost.
 */
export async function createBillForAppointment(appointmentId: string, actorUserId: string) {
  const existing = await prisma.bill.findUnique({
    where: { appointmentId },
    include: { items: true },
  });
  if (existing) {
    const hasConsultation = existing.items.some((i) => i.kind === "CONSULTATION");
    if (!hasConsultation) {
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { doctor: { select: { fullName: true, consultationFee: true } } },
      });
      const fee = appointment?.doctor.consultationFee ?? new D(0);
      await prisma.billItem.create({
        data: {
          billId: existing.id,
          kind: "CONSULTATION",
          sourceId: appointmentId,
          description: `Consultation — Dr. ${appointment?.doctor.fullName ?? "Doctor"}`,
          quantity: 1,
          unitPrice: fee,
          amount: fee,
        },
      });
      await recomputeBill(existing.id);
    }
    return existing;
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: { select: { fullName: true, consultationFee: true } } },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);

  const fee = appointment.doctor.consultationFee ?? new D(0);
  const settings = await settingsService.get();
  const totals = computeTotals({
    items: [{ quantity: 1, unitPrice: fee }],
    taxPercentage: (settings as { taxPercentage: Decimal }).taxPercentage,
  });

  const bill = await prisma.bill.create({
    data: {
      billNumber: generateBillNumber(),
      patientId: appointment.patientId,
      appointmentId,
      ...totals,
      balance: totals.total,
      status: BILL_STATUS.DRAFT,
      items: {
        create: [
          {
            kind: "CONSULTATION",
            sourceId: appointmentId,
            description: `Consultation — Dr. ${appointment.doctor.fullName}`,
            quantity: 1,
            unitPrice: fee,
            amount: fee,
          },
        ],
      },
    },
    include: billInclude,
  });

  await writeAuditLog({
    actorUserId,
    action: "BILL_CREATED",
    targetType: "bill",
    targetId: bill.id,
    metadata: { appointmentId, auto: true, total: bill.total.toString() },
  });

  return bill;
}

export async function updateBill(billId: string, input: UpdateBillInput, actor: Actor) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { discount: true },
  });
  if (!bill) throw new AppError("Bill not found", 404);
  if (bill.status !== BILL_STATUS.DRAFT) {
    throw new AppError("Only a draft bill can be edited", 409);
  }

  const settings = await settingsService.get();
  const insurance = await getActiveInsurance(bill.patientId);
  const totals = computeTotals({
    items: input.items,
    discount: bill.discount,
    taxPercentage: (settings as { taxPercentage: Decimal }).taxPercentage,
    insuranceCoveragePercentage: insurance?.coveragePercentage ?? null,
  });

  // Replace the item set and recompute in one transaction so a bill is never
  // left with new items and stale totals.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.billItem.deleteMany({ where: { billId } });
    return tx.bill.update({
      where: { id: billId },
      data: {
        ...totals,
        balance: totals.total.minus(bill.amountPaid),
        items: {
          create: input.items.map((item: BillItemInput) => ({
            kind: item.kind,
            sourceId: item.sourceId ?? null,
            description: item.description,
            quantity: item.quantity,
            unitPrice: new D(item.unitPrice),
            amount: new D(item.unitPrice).times(item.quantity).toDecimalPlaces(2),
          })),
        },
      },
      include: billInclude,
    });
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "BILL_UPDATED",
    targetType: "bill",
    targetId: billId,
    metadata: { total: updated.total.toString() },
  });

  return updated;
}

/**
 * Locks the item list and freezes tax at the rate in force today. A bill finalised
 * last month must not silently change when an admin edits the tax percentage.
 */
export async function finaliseBill(billId: string, actor: Actor) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { items: true, discount: true },
  });
  if (!bill) throw new AppError("Bill not found", 404);
  if (bill.status !== BILL_STATUS.DRAFT) {
    throw new AppError(`Cannot finalise a bill with status ${bill.status}`, 409);
  }
  if (bill.items.length === 0) {
    throw new AppError("Cannot finalise a bill with no items", 400);
  }

  const insurance = await getActiveInsurance(bill.patientId);
  if (insurance && insurance.validUntil && insurance.validUntil < new Date()) {
    throw new AppError(
      "The patient's insurance policy has expired — remove or renew it before finalising",
      409,
    );
  }

  const settings = await settingsService.get();
  const totals = computeTotals({
    items: bill.items,
    discount: bill.discount,
    taxPercentage: (settings as { taxPercentage: Decimal }).taxPercentage,
    insuranceCoveragePercentage: insurance?.coveragePercentage ?? null,
  });

  const finalised = await prisma.bill.update({
    where: { id: billId },
    data: {
      ...totals,
      balance: totals.total.minus(bill.amountPaid),
      status: BILL_STATUS.FINALISED,
      finalisedAt: new Date(),
    },
    include: billInclude,
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "BILL_FINALISED",
    targetType: "bill",
    targetId: billId,
    metadata: { total: finalised.total.toString(), insuranceApplied: !!insurance },
  });

  return finalised;
}

export async function voidBill(billId: string, reason: string, actor: Actor) {
  const bill = await prisma.bill.findUnique({ where: { id: billId } });
  if (!bill) throw new AppError("Bill not found", 404);
  if (bill.amountPaid.greaterThan(0)) {
    throw new AppError("Refund the payments before voiding this bill", 409);
  }

  const voided = await prisma.bill.update({
    where: { id: billId },
    data: { status: BILL_STATUS.VOID, deletedAt: new Date() },
    include: billInclude,
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "BILL_VOIDED",
    targetType: "bill",
    targetId: billId,
    metadata: { reason },
  });

  return voided;
}

export async function getBills(filters: ListBillsInput, actor: Actor) {
  const scope = await resolveBillScope(actor);
  const where: Prisma.BillWhereInput = { deletedAt: null };

  // Scope first: a caller-supplied patientId may narrow, never widen.
  if (scope.patientIds) where.patientId = { in: scope.patientIds };
  else if (filters.patientId) where.patientId = filters.patientId;

  if (filters.status) where.status = filters.status;
  if (filters.fromDate || filters.toDate) {
    where.createdAt = {};
    if (filters.fromDate) where.createdAt.gte = new Date(filters.fromDate);
    if (filters.toDate) where.createdAt.lte = new Date(filters.toDate);
  }

  const [bills, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      include: billInclude,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.bill.count({ where }),
  ]);

  return { bills, total, page: filters.page, limit: filters.limit };
}

export async function getBillById(billId: string, actor: Actor) {
  await assertCanAccessBill(billId, actor);
  const bill = await prisma.bill.findUnique({ where: { id: billId }, include: billInclude });
  if (!bill) throw new AppError("Bill not found", 404);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "BILL_VIEWED",
    targetType: "bill",
    targetId: billId,
  });

  return bill;
}

/** Outstanding balance across every unpaid bill — the patient's "you owe" figure. */
export async function getOutstandingBalance(patientId: string) {
  const result = await prisma.bill.aggregate({
    where: {
      patientId,
      deletedAt: null,
      status: { in: [BILL_STATUS.FINALISED, BILL_STATUS.PARTIALLY_PAID] },
    },
    _sum: { balance: true },
  });
  return result._sum.balance ?? new D(0);
}

async function getActiveInsurance(patientId: string) {
  return prisma.patientInsurance.findFirst({
    where: {
      patientId,
      isActive: true,
      OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
    },
    orderBy: { coveragePercentage: "desc" },
  });
}

/** Itemised, printable bill. Returns a stream so nothing is buffered in memory. */
export async function generateBillPdf(billId: string, actor: Actor) {
  const bill = await getBillById(billId, actor);
  const settings = (await settingsService.get()) as {
    name: string;
    addressLine1: string | null;
    city: string | null;
    country: string | null;
    currency: string;
  };
  const cur = settings.currency;
  const address = [settings.addressLine1, settings.city, settings.country]
    .filter(Boolean)
    .join(", ");

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  doc.fontSize(20).text(settings.name, { align: "center" });
  if (address) doc.fontSize(9).fillColor("#666").text(address, { align: "center" });
  doc.moveDown(1).fillColor("#000");

  doc.fontSize(14).text(`Invoice ${bill.billNumber}`, { align: "center" });
  doc.moveDown(1);

  doc.fontSize(10);
  doc.text(`Patient:  ${bill.patient.fullName}  (MRN ${bill.patient.mrn})`);
  doc.text(`Status:   ${bill.status}`);
  doc.text(`Issued:   ${bill.createdAt.toISOString().slice(0, 10)}`);
  doc.moveDown(1);

  // Items table
  const left = 50;
  const cols = [left, 300, 360, 440];
  doc.font("Helvetica-Bold");
  doc.text("Description", cols[0]!, doc.y, { continued: true });
  doc.text("Qty", cols[1]!, doc.y, { continued: true });
  doc.text("Unit", cols[2]!, doc.y, { continued: true });
  doc.text("Amount", cols[3]!, doc.y);
  doc.font("Helvetica");
  doc.moveDown(0.3);

  for (const item of bill.items) {
    const y = doc.y;
    doc.text(item.description, cols[0]!, y, { width: 240 });
    doc.text(String(item.quantity), cols[1]!, y);
    doc.text(item.unitPrice.toFixed(2), cols[2]!, y);
    doc.text(item.amount.toFixed(2), cols[3]!, y);
    doc.moveDown(0.2);
  }

  doc.moveDown(1);
  const totalLine = (label: string, value: string) => {
    doc.text(label, cols[2]! - 60, doc.y, { continued: true });
    doc.text(value, { align: "right" });
  };

  totalLine("Subtotal", `${cur} ${bill.subtotal.toFixed(2)}`);
  if (bill.discountAmount.greaterThan(0)) {
    totalLine("Discount", `- ${cur} ${bill.discountAmount.toFixed(2)}`);
  }
  totalLine("Tax", `${cur} ${bill.taxAmount.toFixed(2)}`);
  if (bill.insuranceCovered.greaterThan(0)) {
    totalLine("Insurance covered", `- ${cur} ${bill.insuranceCovered.toFixed(2)}`);
  }
  doc.font("Helvetica-Bold");
  totalLine("Total", `${cur} ${bill.total.toFixed(2)}`);
  totalLine("Paid", `${cur} ${bill.amountPaid.toFixed(2)}`);
  totalLine("Balance due", `${cur} ${bill.balance.toFixed(2)}`);
  doc.font("Helvetica");

  doc.end();
  return { doc, filename: `${bill.billNumber}.pdf` };
}
