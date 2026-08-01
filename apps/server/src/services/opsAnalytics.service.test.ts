import { describe, it, expect } from "vitest";
import { noShowRate } from "./opsAnalytics.service.js";

/**
 * The no-show rate is the number an administrator acts on — it drives
 * overbooking policy — so its edge cases are pinned rather than assumed.
 */
describe("no-show rate", () => {
  it("is 0 for an empty range rather than NaN", () => {
    // A fresh hospital, or a range with no appointments, divides by zero.
    expect(noShowRate(0, 0)).toBe(0);
  });

  it("computes a percentage to one decimal place", () => {
    expect(noShowRate(1, 3)).toBe(33.3);
    expect(noShowRate(2, 8)).toBe(25);
  });

  it("counts cancellations in the denominator", () => {
    // 10 appointments: 2 no-shows, 3 cancelled, 5 attended. Excluding the
    // cancellations would report 28.6% instead of the true 20%.
    expect(noShowRate(2, 10)).toBe(20);
  });

  it("reports 100 when nobody turned up", () => {
    expect(noShowRate(4, 4)).toBe(100);
  });

  it("never returns a negative or non-finite rate for degenerate input", () => {
    expect(noShowRate(0, -5)).toBe(0);
  });
});
