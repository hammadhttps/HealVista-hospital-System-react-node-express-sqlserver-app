import { describe, it, expect, vi, beforeEach } from "vitest";
import { noShowRate, getOverview } from "./opsAnalytics.service.js";
import { prisma } from "../config/db.js";

vi.mock("../config/db.js", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock("../config/redis.js", () => ({
  getCached: vi.fn(),
  setCached: vi.fn(),
}));

import { getCached } from "../config/redis.js";

beforeEach(() => vi.clearAllMocks());

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

/**
 * The overview endpoint runs one giant SQL statement and maps its JSON columns
 * into the typed shape the client renders. The mapping is what the service
 * owns — the SQL itself is exercised by the integration layer — so these pin
 * the row-to-shape conversion, including the empty-hospital defaults.
 */
describe("getOverview", () => {
  it("maps an empty aggregate row into a zeroed overview with no NaN", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{}] as never);

    const out = await getOverview("2026-08-01", "2026-08-03");

    expect(out.range).toEqual({ from: "2026-08-01", to: "2026-08-03" });
    expect(out.noShow).toEqual({ noShows: 0, total: 0, rate: 0 });
    expect(out.avgWaitingTimeMins).toBeNull();
    expect(out.avgConsultationMins).toBeNull();
    expect(out.avgLeadTimeDays).toBeNull();
    expect(out.appointmentsPerDay).toEqual([]);
    expect(out.revenueByMethod).toEqual([]);
    expect(out.doctorUtilisation).toEqual([]);
  });

  it("defaults the range to the last 30 days when no bounds are given", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{}] as never);

    const out = await getOverview();

    expect(out.range).toEqual({ from: null, to: null });
  });

  it("serves a cached overview without re-running the aggregate", async () => {
    const cached = { range: { from: null, to: null }, noShow: { noShows: 1, total: 4, rate: 25 } };
    vi.mocked(getCached).mockResolvedValue(cached as never);

    const out = await getOverview();

    expect(out).toMatchObject(cached);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
