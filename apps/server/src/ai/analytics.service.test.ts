import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAnalyticsQuestion } from "./analytics.service.js";
import { prisma } from "../config/db.js";
import { isAiConfigured } from "./index.js";
import { getCached } from "../config/redis.js";
import { logInteraction } from "./aiInteraction.service.js";
import { AiGenerationError } from "./guardrails.js";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));

vi.mock("../config/db.js", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock("./index.js", () => ({
  getProvider: () => ({
    embed: vi.fn(),
    generate: mockGenerate,
    lastUsage: vi.fn(() => ({})),
  }),
  isAiConfigured: vi.fn(),
}));

vi.mock("./aiInteraction.service.js", () => ({ logInteraction: vi.fn() }));
vi.mock("../config/redis.js", () => ({
  redis: null,
  getCached: vi.fn(),
  setCached: vi.fn(),
}));

const admin = { userId: "a1", role: "ADMIN" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCached).mockResolvedValue(null);
});

describe("runAnalyticsQuestion", () => {
  it("runs the revenue query via keyword classification when AI is unconfigured", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(false);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { day: "2026-07-30", collected: "1250.50" },
    ] as never);

    const result = await runAnalyticsQuestion("how much revenue last week?", admin);

    expect(result.intent).toBe("revenue_by_period");
    expect(result.table.columns).toEqual(["day", "collected"]);
    expect(result.answer).toBeNull();
    expect(result.fallback).toBe(true);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("maps new-patient questions to their intent", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(false);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

    const result = await runAnalyticsQuestion("new patients this month?", admin);

    expect(result.intent).toBe("new_patients");
  });

  it("passes the parsed window as a parameterised days value", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(false);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

    await runAnalyticsQuestion("appointments in the last 14 days", admin);

    const call = vi.mocked(prisma.$queryRaw).mock.calls[0] as unknown as unknown[];
    expect(call[1]).toBe(14);
  });

  it("narrates with the model after classifying and running", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(true);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ no_shows: 2n, total: 20n }] as never);
    mockGenerate
      .mockResolvedValueOnce({ intent: "no_show_rate" })
      .mockResolvedValueOnce({ answer: "1 in 10 appointments were missed." });

    const result = await runAnalyticsQuestion("what's our no-show rate?", admin);

    expect(result.intent).toBe("no_show_rate");
    expect(result.answer).toContain("1 in 10");
    expect(result.fallback).toBe(false);
    expect(result.table.rows[0].rate).toBe("10.0%");
    expect(logInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "analytics-assistant", wasFallback: false }),
    );
  });

  it("returns the table alone when narration fails", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(true);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ status: "COMPLETED", count: 3n }] as never);
    mockGenerate
      .mockResolvedValueOnce({ intent: "appointments_by_status" })
      .mockRejectedValueOnce(new AiGenerationError("down"));

    const result = await runAnalyticsQuestion("appointments by status?", admin);

    expect(result.fallback).toBe(true);
    expect(result.answer).toBeNull();
    expect(result.table.rows).toHaveLength(1);
  });

  it("serves a cached answer without running SQL", async () => {
    vi.mocked(getCached).mockResolvedValue({
      intent: "revenue_by_period",
      answer: "You collected 1250.50.",
      table: { columns: ["day", "collected"], rows: [] },
      fallback: false,
    } as never);

    const result = await runAnalyticsQuestion("revenue last week?", admin);

    expect(result.answer).toBe("You collected 1250.50.");
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
