import { Prisma } from "@prisma/client";
import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import * as settingsService from "./settings.service.js";
import { BILL_STATUS, computeTotals, type Actor } from "./bill.service.js";
import type {
  ApplyDiscountInput,
  CreateDiscountInput,
  UpdateDiscountInput,
} from "@healvista/shared";

const D = Prisma.Decimal;

export async function listDiscounts(onlyActive = false) {
  return prisma.discount.findMany({
    where: onlyActive ? { isActive: true } : {},
    orderBy: { name: "asc" },
  });
}

export async function createDiscount(input: CreateDiscountInput, actor: Actor) {
  try {
    const discount = await prisma.discount.create({
      data: {
        name: input.name,
        code: input.code ?? null,
        type: input.type,
        value: new D(input.value),
        category: input.category ?? null,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        isActive: input.isActive,
      },
    });

    await writeAuditLog({
      actorUserId: actor.userId,
      action: "DISCOUNT_CREATED",
      targetType: "discount",
      targetId: discount.id,
      metadata: { name: discount.name, type: discount.type, value: discount.value.toString() },
    });

    return discount;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError("A discount with that name or code already exists", 409);
    }
    throw err;
  }
}

export async function updateDiscount(id: string, input: UpdateDiscountInput, actor: Actor) {
  const existing = await prisma.discount.findUnique({ where: { id } });
  if (!existing) throw new AppError("Discount not found", 404);

  const discount = await prisma.discount.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.code !== undefined && { code: input.code }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.value !== undefined && { value: new D(input.value) }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.validFrom !== undefined && {
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
      }),
      ...(input.validUntil !== undefined && {
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
      }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "DISCOUNT_UPDATED",
    targetType: "discount",
    targetId: id,
    metadata: { changes: Object.keys(input) },
  });

  return discount;
}

/**
 * Deactivates rather than deletes. Bills reference the discount that was applied to
 * them, and a historical invoice must stay explainable years later.
 */
export async function deactivateDiscount(id: string, actor: Actor) {
  const existing = await prisma.discount.findUnique({ where: { id } });
  if (!existing) throw new AppError("Discount not found", 404);

  const discount = await prisma.discount.update({ where: { id }, data: { isActive: false } });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "DISCOUNT_DEACTIVATED",
    targetType: "discount",
    targetId: id,
  });

  return discount;
}

function assertUsable(discount: {
  isActive: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
}) {
  if (!discount.isActive) throw new AppError("That discount is no longer active", 409);

  const now = new Date();
  if (discount.validFrom && discount.validFrom > now) {
    throw new AppError("That discount is not valid yet", 409);
  }
  if (discount.validUntil && discount.validUntil < now) {
    throw new AppError("That discount has expired", 409);
  }
}

/**
 * Applies exactly one discount to a draft bill and recomputes every total.
 *
 * Stacking is rejected outright: a bill carries a single `discountId`, so silently
 * replacing an existing one would let a clerk pile reductions on by re-posting.
 */
export async function applyDiscountToBill(
  billId: string,
  input: ApplyDiscountInput,
  actor: Actor,
) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { items: true },
  });
  if (!bill) throw new AppError("Bill not found", 404);
  if (bill.status !== BILL_STATUS.DRAFT) {
    throw new AppError("A discount can only be applied to a draft bill", 409);
  }
  if (bill.discountId) {
    throw new AppError(
      "This bill already has a discount — remove it before applying another. Discounts do not stack.",
      409,
    );
  }

  const discount = input.discountId
    ? await prisma.discount.findUnique({ where: { id: input.discountId } })
    : await prisma.discount.findUnique({ where: { code: input.code! } });
  if (!discount) throw new AppError("Discount not found", 404);
  assertUsable(discount);

  const settings = await settingsService.get();
  const insurance = await prisma.patientInsurance.findFirst({
    where: {
      patientId: bill.patientId,
      isActive: true,
      OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
    },
    orderBy: { coveragePercentage: "desc" },
  });

  const totals = computeTotals({
    items: bill.items,
    discount,
    taxPercentage: (settings as { taxPercentage: Prisma.Decimal }).taxPercentage,
    insuranceCoveragePercentage: insurance?.coveragePercentage ?? null,
  });

  const updated = await prisma.bill.update({
    where: { id: billId },
    data: {
      discountId: discount.id,
      ...totals,
      balance: totals.total.minus(bill.amountPaid),
    },
    include: { items: true, discount: true, payments: true },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "BILL_DISCOUNT_APPLIED",
    targetType: "bill",
    targetId: billId,
    metadata: {
      discountId: discount.id,
      discountName: discount.name,
      discountAmount: totals.discountAmount.toString(),
      newTotal: totals.total.toString(),
    },
  });

  return updated;
}

export async function removeDiscountFromBill(billId: string, actor: Actor) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { items: true },
  });
  if (!bill) throw new AppError("Bill not found", 404);
  if (bill.status !== BILL_STATUS.DRAFT) {
    throw new AppError("A discount can only be removed from a draft bill", 409);
  }
  if (!bill.discountId) throw new AppError("This bill has no discount", 400);

  const settings = await settingsService.get();
  const insurance = await prisma.patientInsurance.findFirst({
    where: {
      patientId: bill.patientId,
      isActive: true,
      OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
    },
    orderBy: { coveragePercentage: "desc" },
  });

  const totals = computeTotals({
    items: bill.items,
    discount: null,
    taxPercentage: (settings as { taxPercentage: Prisma.Decimal }).taxPercentage,
    insuranceCoveragePercentage: insurance?.coveragePercentage ?? null,
  });

  const updated = await prisma.bill.update({
    where: { id: billId },
    data: { discountId: null, ...totals, balance: totals.total.minus(bill.amountPaid) },
    include: { items: true, discount: true, payments: true },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "BILL_DISCOUNT_REMOVED",
    targetType: "bill",
    targetId: billId,
    metadata: { previousDiscountId: bill.discountId },
  });

  return updated;
}
