import { describe, it, expect } from "vitest";
import {
  hasSufficientStock,
  remainingOnItem,
  deriveDispenseStatus,
} from "./pharmacy.service.js";

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
