import { z } from "zod";

/**
 * Money is always a string on the wire and a Decimal in the database — never a JS
 * number, which cannot represent 0.1 + 0.2 exactly. Server-side arithmetic uses
 * Prisma.Decimal throughout.
 */
export const moneyString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Must be a positive amount with at most 2 decimal places");

export const billItemKindEnum = z.enum(["CONSULTATION", "LAB", "PHARMACY", "PROCEDURE", "OTHER"]);

export const billStatusEnum = z.enum(["draft", "finalised", "partially_paid", "paid", "void"]);

export const paymentMethodEnum = z.enum(["CARD", "CASH", "BANK_TRANSFER", "WALLET", "INSURANCE"]);

// ─── Bills ──────────────────────────────────────────────────────────────────

export const billItemInputSchema = z.object({
  kind: billItemKindEnum,
  sourceId: z.string().uuid().optional(),
  description: z.string().min(1).max(300),
  quantity: z.coerce.number().int().min(1).default(1),
  unitPrice: moneyString,
});

export type BillItemInput = z.infer<typeof billItemInputSchema>;

export const createBillSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  items: z.array(billItemInputSchema).min(1),
});

export type CreateBillInput = z.infer<typeof createBillSchema>;

/**
 * Only the item list is editable on a draft. Totals are never accepted from the
 * client — they are recomputed server-side on every mutation.
 */
export const updateBillSchema = z.object({
  items: z.array(billItemInputSchema).min(1),
});

export type UpdateBillInput = z.infer<typeof updateBillSchema>;

/** Only an admin voids, and a voided bill must be explainable later. */
export const voidBillSchema = z.object({
  reason: z.string().min(1).max(300),
});

export type VoidBillInput = z.infer<typeof voidBillSchema>;

export const listBillsSchema = z.object({
  status: billStatusEnum.optional(),
  patientId: z.string().uuid().optional(),
  // Coerced dates: a garbage string must fail Zod (400), never reach Prisma as
  // `new Date("Invalid Date")` and surface as a 500.
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListBillsInput = z.infer<typeof listBillsSchema>;

// ─── Discounts ──────────────────────────────────────────────────────────────

export const discountTypeEnum = z.enum(["percentage", "fixed"]);
export const discountCategoryEnum = z.enum(["employee", "senior_citizen", "student", "campaign"]);

export const createDiscountSchema = z
  .object({
    name: z.string().min(1).max(120),
    code: z.string().min(2).max(40).optional(),
    type: discountTypeEnum,
    value: moneyString,
    category: discountCategoryEnum.optional(),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.type !== "percentage" || Number(d.value) <= 100, {
    message: "A percentage discount cannot exceed 100",
    path: ["value"],
  })
  .refine((d) => !d.validFrom || !d.validUntil || new Date(d.validFrom) < new Date(d.validUntil), {
    message: "validFrom must be before validUntil",
    path: ["validUntil"],
  });

export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;

export const updateDiscountSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  code: z.string().min(2).max(40).nullable().optional(),
  type: discountTypeEnum.optional(),
  value: moneyString.optional(),
  category: discountCategoryEnum.nullable().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateDiscountInput = z.infer<typeof updateDiscountSchema>;

export const applyDiscountSchema = z
  .object({
    discountId: z.string().uuid().optional(),
    code: z.string().min(2).max(40).optional(),
  })
  .refine((d) => !!d.discountId || !!d.code, {
    message: "Provide either discountId or code",
  });

export type ApplyDiscountInput = z.infer<typeof applyDiscountSchema>;

// ─── Payments ───────────────────────────────────────────────────────────────

export const createIntentSchema = z.object({
  billId: z.string().uuid(),
  amount: moneyString.optional(), // omitted = pay the full outstanding balance
  provider: z.enum(["stripe"]).default("stripe"),
});

export type CreateIntentInput = z.infer<typeof createIntentSchema>;

export const cashPaymentSchema = z.object({
  billId: z.string().uuid(),
  amount: moneyString,
  reference: z.string().max(120).optional(),
});

export type CashPaymentInput = z.infer<typeof cashPaymentSchema>;

export const refundSchema = z.object({
  amount: moneyString.optional(), // omitted = refund the full payment
  reason: z.string().min(3).max(300),
});

export type RefundInput = z.infer<typeof refundSchema>;

export const paymentHistorySchema = z.object({
  billId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  method: paymentMethodEnum.optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaymentHistoryInput = z.infer<typeof paymentHistorySchema>;

// ─── Insurance ──────────────────────────────────────────────────────────────

export const createInsuranceSchema = z.object({
  patientId: z.string().uuid(),
  providerName: z.string().min(1).max(160),
  policyNumber: z.string().min(1).max(80),
  coveragePercentage: z.coerce.number().int().min(1).max(100),
  validUntil: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
});

export type CreateInsuranceInput = z.infer<typeof createInsuranceSchema>;

export const updateInsuranceSchema = createInsuranceSchema.partial().omit({ patientId: true });

export type UpdateInsuranceInput = z.infer<typeof updateInsuranceSchema>;
