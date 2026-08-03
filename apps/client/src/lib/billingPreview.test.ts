import { describe, it, expect } from "vitest";
import { previewDiscount } from "./billingPreview";

/**
 * Discount live-total preview (Phase 3.2).
 *
 * The preview must agree with the server's `computeTotals`, whose order is not
 * arbitrary: discount off the subtotal, tax on the discounted amount, insurance
 * on what remains. A preview that used the wrong order would show a total the
 * finalised bill then overrode — exactly what a clerk notices only after the
 * patient has already paid.
 */

const baseBill = {
  subtotal: 100,
  discountAmount: 0,
  taxAmount: 10,
  insuranceCovered: 0,
  total: 110,
};

describe("previewDiscount", () => {
  it("applies a percentage discount to the subtotal before tax", () => {
    // 100 - 10% = 90; tax 10% => 99.
    const p = previewDiscount(baseBill, { type: "percentage", value: 10 });
    expect(p.total).toBe(99);
    expect(p.discountAmount).toBe(10);
    expect(p.savings).toBe(11);
  });

  it("applies a fixed discount in full", () => {
    // 100 - 20 = 80; tax 10% => 88.
    const p = previewDiscount(baseBill, { type: "fixed", value: 20 });
    expect(p.total).toBe(88);
    expect(p.discountAmount).toBe(20);
  });

  it("caps a fixed discount at the subtotal so the total never goes negative", () => {
    const p = previewDiscount(baseBill, { type: "fixed", value: 500 });
    expect(p.discountAmount).toBe(100);
    expect(p.total).toBe(0);
  });

  it("keeps insurance covering a share of the discounted total", () => {
    // 10% tax => 110 gross; 50% insured => 55. With a 20% discount:
    // subtotal 80 + tax 8 = 88 gross; 44 covered => 44 owed.
    const p = previewDiscount(
      { subtotal: 100, discountAmount: 0, taxAmount: 10, insuranceCovered: 55, total: 55 },
      { type: "percentage", value: 20 },
    );
    expect(p.total).toBe(44);
  });

  it("reports zero savings for a nil discount", () => {
    const p = previewDiscount(baseBill, { type: "percentage", value: 0 });
    expect(p.total).toBe(110);
    expect(p.savings).toBe(0);
  });

  it("accepts money fields serialised as strings", () => {
    const p = previewDiscount(
      {
        subtotal: "100",
        discountAmount: "0",
        taxAmount: "10",
        insuranceCovered: "0",
        total: "110",
      },
      { type: "percentage", value: "10" },
    );
    expect(p.total).toBe(99);
  });
});
