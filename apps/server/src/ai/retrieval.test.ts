import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../config/db.js";
import { writeAuditLog } from "../utils/audit.js";
import { resolveRetrievalScope, retrieve } from "./retrieval.js";

const { mockEmbed } = vi.hoisted(() => ({ mockEmbed: vi.fn() }));

vi.mock("../config/db.js", () => ({
  prisma: {
    patient: { findUnique: vi.fn() },
    doctor: { findUnique: vi.fn() },
    patientRelationship: { findMany: vi.fn() },
    appointment: { findMany: vi.fn() },
    referral: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("./index.js", () => ({
  getProvider: () => ({
    embed: mockEmbed,
    generate: vi.fn(),
    lastUsage: vi.fn(() => ({})),
  }),
  isAiConfigured: vi.fn(() => true),
}));

vi.mock("../utils/audit.js", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

/** A chunk row as Postgres would hand it back. */
function row(overrides: Partial<{ patientId: string | null; similarity: number }> = {}) {
  return {
    id: "chunk-1",
    content: "Sample chunk content",
    source_type: "consultation_note",
    source_id: "note-1",
    patient_id: overrides.patientId ?? null,
    chunk_index: 0,
    similarity: overrides.similarity ?? 0.9,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);
  // Simulates the real query's `WHERE patient_id = ANY(scope)` — rows for patients
  // outside the scope array are unreachable, mirroring the DB-level isolation.
  (prisma.$queryRaw as any).mockImplementation(async (_sql: unknown, ...values: unknown[]) => {
    const scopeIds = values[1] as string[] | undefined;
    if (!Array.isArray(scopeIds)) return [];
    return ALL_ROWS.filter((r) => scopeIds.includes(r.patient_id as string));
  });
});

const ALL_ROWS = [
  row({ patientId: "pa", similarity: 0.85 }),
  row({ patientId: "pb", similarity: 0.82 }),
];

describe("resolveRetrievalScope", () => {
  it("patient scope is self plus dependants with records access", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: "p1" } as never);
    vi.mocked(prisma.patientRelationship.findMany).mockResolvedValue([
      { dependentPatientId: "p2" },
      { dependentPatientId: "p3" },
    ] as never);

    const scope = await resolveRetrievalScope({ userId: "u1", role: "PATIENT" });
    expect(scope.patientIds).toEqual(["p1", "p2", "p3"]);
  });

  it("doctor scope is shared appointments plus accepted referrals, deduped", async () => {
    vi.mocked(prisma.doctor.findUnique).mockResolvedValue({ id: "d1" } as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { patientId: "a1" },
      { patientId: "a2" },
    ] as never);
    vi.mocked(prisma.referral.findMany).mockResolvedValue([
      { patientId: "a1" },
      { patientId: "a3" },
    ] as never);

    const scope = await resolveRetrievalScope({ userId: "u2", role: "DOCTOR" });
    expect(scope.patientIds).toEqual(["a1", "a2", "a3"]);
  });

  it.each(["RECEPTIONIST", "ACCOUNTANT", "ADMIN", "PHARMACIST", "LAB_TECHNICIAN"])(
    "%s has no clinical retrieval scope",
    async (role) => {
      const scope = await resolveRetrievalScope({ userId: "u9", role });
      expect(scope.patientIds).toEqual([]);
      // None of the patient/doctor lookups should even run.
      expect(prisma.patient.findUnique).not.toHaveBeenCalled();
      expect(prisma.doctor.findUnique).not.toHaveBeenCalled();
    },
  );
});

describe("retrieve", () => {
  it("embeds the PII-stripped question and returns cited chunks above the floor", async () => {
    const question = "Is my follow-up still due for the phone 555-123-4567?";
    vi.mocked(prisma.$queryRaw).mockResolvedValue([row({ patientId: "pa", similarity: 0.85 })]);

    const results = await retrieve(
      question,
      { patientIds: ["pa"] },
      {
        actor: { userId: "u1", role: "PATIENT" },
        feature: "patient-assistant",
      },
    );

    // PII stripped before the embedding call.
    const embedded = mockEmbed.mock.calls[0][0] as string[];
    expect(embedded[0]).not.toContain("555-123-4567");

    expect(results).toHaveLength(1);
    expect(results[0].sourceType).toBe("consultation_note");
    expect(results[0].sourceId).toBe("note-1");
    expect(results[0].similarity).toBeCloseTo(0.85);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "u1",
        action: "AI_RETRIEVAL",
        targetType: "patient",
        targetId: "pa",
        metadata: expect.objectContaining({ feature: "patient-assistant" }),
      }),
    );
  });

  it("drops chunks below the similarity floor", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      row({ patientId: "pa", similarity: 0.9 }),
      row({ patientId: "pa", similarity: 0.1 }),
    ]);

    const results = await retrieve("question", { patientIds: ["pa"] });
    expect(results).toHaveLength(1);
    expect(results[0].similarity).toBeCloseTo(0.9);
  });

  it("doctor A's query cannot retrieve doctor B's patient's chunks", async () => {
    // Doctor A is treating only patient `pa`.
    vi.mocked(prisma.doctor.findUnique).mockResolvedValue({ id: "dA" } as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([{ patientId: "pa" }] as never);
    vi.mocked(prisma.referral.findMany).mockResolvedValue([] as never);

    const scope = await resolveRetrievalScope({ userId: "uA", role: "DOCTOR" });
    expect(scope.patientIds).toEqual(["pa"]);

    // `ALL_ROWS` contains `pb`'s chunk too — the mocked WHERE must keep it out.
    const results = await retrieve("anything", scope, {
      actor: { userId: "uA", role: "DOCTOR" },
    });

    expect(results).toHaveLength(1);
    expect(results[0].patientId).toBe("pa");
    // The scope array handed to SQL is exactly doctor A's patients — `pb` never
    // enters the query at all. (calls[0] = [sql, vector, scope, k])
    const scopeParam = vi.mocked(prisma.$queryRaw).mock.calls[0][2] as string[];
    expect(scopeParam).toEqual(["pa"]);
  });

  it("returns nothing without embedding when there is no scope and no KB mode", async () => {
    const results = await retrieve("question", { patientIds: [] });
    expect(results).toEqual([]);
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("searches only non-patient content in KB mode", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([row({ patientId: null, similarity: 0.9 })]);

    const results = await retrieve(
      "What is the visitor policy?",
      { patientIds: [] },
      { kbOnly: true },
    );

    expect(results).toHaveLength(1);
    expect(results[0].patientId).toBeNull();
    expect(writeAuditLog).not.toHaveBeenCalled();
    // The KB query scopes on `patient_id IS NULL` in the WHERE — never ANY(...).
    const sql = (vi.mocked(prisma.$queryRaw).mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toContain("patient_id IS NULL");
    expect(sql).not.toContain("patient_id = ANY");
  });
});
