/**
 * Live discount preview (Phase 3.2).
 *
 * The billing console shows what a bill's total *will* become when a discount is
 * applied — before the clerk commits to it. The authoritative arithmetic lives in
 * the server's `computeTotals` (apps/server/src/services/bill.service.ts); this
 * mirrors that order so the preview and the eventual bill never disagree:
 * discount comes off the subtotal, tax applies to the discounted amount, and
 * insurance covers a share of what is left.
 */

export interface BillTotals {
  subtotal: string | number;
  discountAmount: string | number;
  taxAmount: string | number;
  insuranceCovered: string | number;
  total: string | number;
}

export interface DiscountOption {
  type: "percentage" | "fixed";
  value: string | number;
}

export interface DiscountPreview {
  /** New total after the discount is applied. */
  total: number;
  /** Money the discount removes from the subtotal. */
  discountAmount: number;
  /** What the patient saves relative to the current total. */
  savings: number;
}

function toNum(v: string | number): number {
  return typeof v === "number" ? v : Number(v);
}

/** Round to 2dp the same way Decimal.toDecimalPlaces(2) does for money. */
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function previewDiscount(bill: BillTotals, discount: DiscountOption): DiscountPreview {
  const subtotal = toNum(bill.subtotal);
  const currentDiscount = toNum(bill.discountAmount);
  const currentTax = toNum(bill.taxAmount);
  const currentInsured = toNum(bill.insuranceCovered);
  const currentTotal = toNum(bill.total);

  // Back the effective rates out of the bill as it stands, so the preview needs
  // no extra fields the API does not already return.
  const taxableBefore = subtotal - currentDiscount;
  const taxPercentage = taxableBefore > 0 ? (currentTax / taxableBefore) * 100 : 0;
  const grossBefore = taxableBefore + currentTax;
  const coveragePercentage = grossBefore > 0 ? (currentInsured / grossBefore) * 100 : 0;

  const discountValue = toNum(discount.value);
  const rawDiscount =
    discount.type === "percentage" ? (subtotal * discountValue) / 100 : discountValue;
  const discountAmount = r2(Math.min(rawDiscount, subtotal));

  const taxable = subtotal - discountAmount;
  const taxAmount = r2((taxable * taxPercentage) / 100);
  const grossTotal = taxable + taxAmount;
  const insuranceCovered = r2((grossTotal * coveragePercentage) / 100);
  const total = r2(grossTotal - insuranceCovered);

  return { total, discountAmount, savings: r2(currentTotal - total) };
}
