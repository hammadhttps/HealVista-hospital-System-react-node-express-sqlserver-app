import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../config/db.js";
import { isAiConfigured } from "./index.js";
import { AiGenerationError } from "./guardrails.js";
import { logInteraction } from "./aiInteraction.service.js";
import { assertTreatingDoctor } from "../services/note.service.js";
import { signDeliveryUrl } from "../services/record.service.js";
import {
  explainLabReport,
  explainPrescription,
  recommendFollowUp,
  ocrRecord,
  summarizeRecord,
} from "./directPrompts.service.js";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));

vi.mock("../config/env.js", () => ({ env: { JINA_CHAT_MODEL: "jina-vlm" } }));

vi.mock("../config/db.js", () => ({
  prisma: {
    labOrder: { findUnique: vi.fn(), findMany: vi.fn() },
    prescription: { findUnique: vi.fn() },
    appointment: { findUnique: vi.fn() },
    medicalRecord: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../config/bull.js", () => ({ addSummaryJob: vi.fn() }));
vi.mock("../utils/audit.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../services/access.service.js", () => ({
  assertClinicalAccess: vi.fn().mockResolvedValue({ allowed: true, reason: "treating_doctor" }),
}));
vi.mock("../services/note.service.js", () => ({
  assertTreatingDoctor: vi.fn().mockResolvedValue({
    appointment: { id: "a1", patientId: "p1", doctorId: "d1", status: "COMPLETED" },
    doctor: { id: "d1", fullName: "Dr. House" },
  }),
}));
vi.mock("../services/record.service.js", () => ({
  signDeliveryUrl: vi.fn().mockReturnValue("https://res.cloudinary.com/x/signed"),
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

const actor = { userId: "u1", role: "DOCTOR" };

const order = {
  id: "o1",
  patientId: "p1",
  items: [
    {
      labTest: { name: "Hemoglobin", code: "HB" },
      resultValue: "12.5",
      unit: "g/dL",
      referenceRange: "12-16",
      flag: "NORMAL",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAiConfigured).mockReturnValue(true);
  vi.mocked(prisma.labOrder.findUnique).mockResolvedValue(order as never);
  vi.mocked(assertTreatingDoctor).mockResolvedValue({
    appointment: { id: "a1", patientId: "p1", doctorId: "d1", status: "COMPLETED" },
    doctor: { id: "d1", fullName: "Dr. House" },
  });
});

describe("explainLabReport", () => {
  it("returns a fallback with the raw flagged values when AI is unconfigured", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(false);

    const result = await explainLabReport("o1", actor);

    expect(result.fallback).toBe(true);
    expect(result.explanation).toBeNull();
    expect(result.highlights).toHaveLength(1);
    expect(result.highlights[0].test).toBe("Hemoglobin");
    expect(logInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "lab-explain", wasFallback: true }),
    );
  });

  it("returns the validated explanation on success", async () => {
    mockGenerate.mockResolvedValue({
      explanation: "Your hemoglobin is in the normal range.",
      highlights: [
        { test: "Hemoglobin", value: "12.5", flag: "NORMAL", note: "Reference range: 12-16" },
      ],
    });

    const result = await explainLabReport("o1", actor);

    expect(result.fallback).toBe(false);
    expect(result.explanation).toContain("hemoglobin");
    expect(logInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "lab-explain", wasFallback: false }),
    );
  });

  it("falls back when generation fails (malformed or declined output)", async () => {
    mockGenerate.mockRejectedValue(new AiGenerationError("provider declined"));

    const result = await explainLabReport("o1", actor);

    expect(result.fallback).toBe(true);
    expect(result.explanation).toBeNull();
  });

  it("refuses when there are no result values yet", async () => {
    vi.mocked(prisma.labOrder.findUnique).mockResolvedValue({
      ...order,
      items: [{ labTest: { name: "Hemoglobin", code: "HB" }, resultValue: null, flag: null }],
    } as never);

    await expect(explainLabReport("o1", actor)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("explainPrescription", () => {
  it("refuses to explain a draft prescription", async () => {
    vi.mocked(prisma.prescription.findUnique).mockResolvedValue({
      id: "rx1",
      isDraft: true,
      appointment: { patientId: "p1" },
    } as never);

    await expect(explainPrescription("rx1", actor)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns a fallback without calling the provider when AI is unconfigured", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(false);
    vi.mocked(prisma.prescription.findUnique).mockResolvedValue({
      id: "rx1",
      isDraft: false,
      deletedAt: null,
      appointment: { patientId: "p1" },
      items: [
        {
          medicineName: "Aspirin",
          dosage: "75mg",
          frequency: "od",
          durationDays: 30,
          instructions: null,
        },
      ],
      notes: null,
    } as never);

    const result = await explainPrescription("rx1", actor);

    expect(result.fallback).toBe(true);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("recommendFollowUp", () => {
  it("enforces the treating-doctor gate before anything else", async () => {
    const boom = new Error("Only the treating doctor may write this consultation note") as Error & {
      statusCode: number;
    };
    boom.statusCode = 403;
    vi.mocked(assertTreatingDoctor).mockRejectedValue(boom);
    vi.mocked(prisma.appointment.findUnique).mockResolvedValue(null);

    await expect(recommendFollowUp("a1", actor)).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.appointment.findUnique).not.toHaveBeenCalled();
  });

  it("returns a fallback when AI is unconfigured", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(false);
    vi.mocked(prisma.appointment.findUnique).mockResolvedValue({
      id: "a1",
      patientId: "p1",
      reasonNote: "Follow-up on fever",
      note: { assessment: "Viral fever", plan: "Rest" },
      prescription: null,
    } as never);
    vi.mocked(prisma.labOrder.findMany).mockResolvedValue([] as never);

    const result = await recommendFollowUp("a1", actor);

    expect(result.fallback).toBe(true);
    expect(result.intervalDays).toBeNull();
    expect(assertTreatingDoctor).toHaveBeenCalledWith("a1", actor);
  });
});

describe("ocrRecord", () => {
  it("rejects non-image records", async () => {
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue({
      id: "r1",
      patientId: "p1",
      fileType: "pdf",
      title: "CBC",
      deletedAt: null,
    } as never);

    await expect(ocrRecord("r1", actor)).rejects.toMatchObject({ statusCode: 400 });
    expect(signDeliveryUrl).not.toHaveBeenCalled();
  });

  it("returns a fallback without fetching when AI is unconfigured", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(false);
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue({
      id: "r1",
      patientId: "p1",
      fileType: "jpeg",
      title: "Prescription photo",
      deletedAt: null,
    } as never);

    const result = await ocrRecord("r1", actor);

    expect(result.fallback).toBe(true);
    expect(signDeliveryUrl).not.toHaveBeenCalled();
  });
});

describe("summarizeRecord (queued)", () => {
  it("does nothing when the record has no extractable text", async () => {
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue({
      id: "r1",
      patientId: "p1",
      extractedText: null,
      aiSummary: null,
      deletedAt: null,
    } as never);

    await summarizeRecord("r1");

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(prisma.medicalRecord.update).not.toHaveBeenCalled();
  });

  it("writes a validated summary into MedicalRecord.aiSummary", async () => {
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue({
      id: "r1",
      patientId: "p1",
      title: "CBC report",
      extractedText: "Hemoglobin 12.5 g/dL. WBC 8000.",
      aiSummary: null,
      deletedAt: null,
      uploadedById: "u1",
    } as never);
    mockGenerate.mockResolvedValue({
      keyValues: [{ name: "Hemoglobin", value: "12.5", referenceRange: "12-16" }],
      flags: [],
      plainLanguageSummary: "Most values are within normal range.",
    });

    await summarizeRecord("r1");

    const update = vi.mocked(prisma.medicalRecord.update);
    expect(update).toHaveBeenCalledTimes(1);
    const { data } = update.mock.calls[0][0] as { data: { aiSummary: Record<string, unknown> } };
    expect(data.aiSummary.plainLanguageSummary).toBe("Most values are within normal range.");
    expect(data.aiSummary.keyValues).toHaveLength(1);
    expect(logInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "report-summary", wasFallback: false }),
    );
  });

  it("writes a fallback marker instead of retrying forever on failure", async () => {
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue({
      id: "r1",
      patientId: "p1",
      title: "CBC report",
      extractedText: "Hemoglobin 12.5 g/dL.",
      aiSummary: null,
      deletedAt: null,
      uploadedById: "u1",
    } as never);
    mockGenerate.mockRejectedValue(new AiGenerationError("down"));

    await summarizeRecord("r1");

    const update = vi.mocked(prisma.medicalRecord.update);
    expect(update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { aiSummary: expect.objectContaining({ fallback: true }) },
    });
  });
});
