import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../config/db.js";

vi.mock("../config/db.js", () => ({
  prisma: {
    patient: { findUnique: vi.fn() },
    doctor: { findUnique: vi.fn() },
    appointment: { findFirst: vi.fn() },
    prescription: { findFirst: vi.fn() },
    medicalRecord: { findMany: vi.fn() },
    labOrder: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("../config/redis.js", () => ({
  redis: null,
  getCached: vi.fn(),
  setCached: vi.fn(),
}));

import { getCached } from "../config/redis.js";
import { getDashboard } from "./dashboard.service.js";

beforeEach(() => {
  vi.clearAllMocks();
  // Every dashboard test starts on a cache miss unless it opts in to a hit.
  vi.mocked(getCached).mockResolvedValue(null as never);
});

/** Returns the patient-dashboard $queryRaw rows for a given query text. */
function mockPatientRaw() {
  vi.mocked(prisma.$queryRaw).mockImplementation(((strings: unknown, ..._values: unknown[]) => {
    const sql = String(strings);
    if (sql.includes('AS "totalAppointments"')) {
      return Promise.resolve([{ totalAppointments: 5n }]) as never;
    }
    if (sql.includes("outstanding")) {
      return Promise.resolve([{ outstanding: "120.50" }]) as never;
    }
    return Promise.resolve([]) as never;
  }) as never);
}

/**
 * KPI arithmetic (Phase 6.9). Every dashboard number is an aggregate produced in
 * SQL; what the service owns is the mapping from a row to the KPI the client
 * renders. These pin that mapping for the patient set — the most account-critical
 * of the role dashboards, since it feeds the "outstanding balance" a patient
 * acts on.
 */
describe("getDashboard", () => {
  it("throws for a role with no dashboard", async () => {
    await expect(getDashboard("INTERN", "u1")).rejects.toThrow(/No dashboard/);
  });

  it("returns a cache hit without touching the database", async () => {
    const cached = { role: "PATIENT", kpis: [], sections: [] };
    vi.mocked(getCached).mockResolvedValue(cached as never);

    const result = await getDashboard("PATIENT", "u1");

    expect(result).toMatchObject(cached);
    expect(prisma.patient.findUnique).not.toHaveBeenCalled();
  });

  it("patient dashboard maps aggregate rows into KPIs with correct units", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: "p1", userId: "u1" } as never);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.prescription.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.medicalRecord.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.labOrder.findMany).mockResolvedValue([] as never);
    mockPatientRaw();

    const data = await getDashboard("PATIENT", "u1");

    const byKey = Object.fromEntries(data.kpis.map((k) => [k.key, k]));
    expect(byKey.totalAppointments.value).toBe(5);
    expect(byKey.outstandingBalance.value).toBe(120.5);
    expect(byKey.outstandingBalance.unit).toBe("currency");
    expect(data.role).toBe("PATIENT");
    // A fresh response is tagged with when it was computed; a cached one is not.
    expect(typeof data.cachedAt).toBe("string");
  });

  it("patient dashboard defaults missing aggregates to zero rather than NaN", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: "p1", userId: "u1" } as never);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.prescription.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.medicalRecord.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.labOrder.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

    const data = await getDashboard("PATIENT", "u1");

    const byKey = Object.fromEntries(data.kpis.map((k) => [k.key, k]));
    expect(byKey.totalAppointments.value).toBe(0);
    expect(byKey.outstandingBalance.value).toBe(0);
  });

  it("caches the computed dashboard for 60 seconds", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: "p1", userId: "u1" } as never);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.prescription.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.medicalRecord.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.labOrder.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

    const { setCached } = await import("../config/redis.js");
    await getDashboard("PATIENT", "u1");

    expect(setCached).toHaveBeenCalledWith(
      expect.stringMatching(/^dashboard:PATIENT:u1$/),
      expect.objectContaining({ role: "PATIENT" }),
      60,
    );
  });
});
