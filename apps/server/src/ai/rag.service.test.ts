import { describe, it, expect, vi, beforeEach } from "vitest";
import { assistant, timelineSummary, semanticSearch } from "./rag.service.js";
import { isAiConfigured } from "./index.js";
import { resolveRetrievalScope, retrieve } from "./retrieval.js";
import { getCached, setCached } from "../config/redis.js";
import { logInteraction } from "./aiInteraction.service.js";
import { AiGenerationError } from "./guardrails.js";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));

vi.mock("./index.js", () => ({
  getProvider: () => ({
    embed: vi.fn(),
    generate: mockGenerate,
    lastUsage: vi.fn(() => ({})),
  }),
  isAiConfigured: vi.fn(),
}));

vi.mock("./retrieval.js", () => ({
  resolveRetrievalScope: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock("./aiInteraction.service.js", () => ({ logInteraction: vi.fn() }));

vi.mock("../config/redis.js", () => ({
  redis: null,
  getCached: vi.fn(),
  setCached: vi.fn(),
}));

const chunks = [
  {
    id: "c1",
    content: "Aspirin 75mg once daily after food.",
    sourceType: "prescription",
    sourceId: "rx1",
    patientId: "p1",
    chunkIndex: 0,
    similarity: 0.82,
  },
  {
    id: "c2",
    content: "Aspirin 75mg once daily after food.",
    sourceType: "prescription",
    sourceId: "rx1",
    patientId: "p1",
    chunkIndex: 1,
    similarity: 0.71,
  },
  {
    id: "c3",
    content: "Patient reported the fever resolved by day three.",
    sourceType: "consultation_note",
    sourceId: "n1",
    patientId: "p1",
    chunkIndex: 0,
    similarity: 0.64,
  },
];

const patientActor = { userId: "u1", role: "PATIENT" };
const doctorActor = { userId: "u2", role: "DOCTOR" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAiConfigured).mockReturnValue(true);
  vi.mocked(getCached).mockResolvedValue(null);
  vi.mocked(retrieve).mockResolvedValue(chunks as never);
});

describe("assistant", () => {
  it("asks across a patient's full scope (self + dependants)", async () => {
    vi.mocked(resolveRetrievalScope).mockResolvedValue({ patientIds: ["p1", "p2"] } as never);
    mockGenerate.mockResolvedValue({ answer: "You are currently on Aspirin 75mg once daily." });

    const result = await assistant("what medicines am I on?", patientActor);

    expect(result.fallback).toBe(false);
    expect(result.answer).toContain("Aspirin");
    expect(retrieve).toHaveBeenCalledWith(
      "what medicines am I on?",
      { patientIds: ["p1", "p2"] },
      expect.objectContaining({ feature: "patient-assistant" }),
    );
  });

  it("narrows a patient to one dependant when they name it", async () => {
    vi.mocked(resolveRetrievalScope).mockResolvedValue({ patientIds: ["p1", "p2"] } as never);
    mockGenerate.mockResolvedValue({ answer: "All normal." });

    await assistant("anything new?", patientActor, "p2");

    expect(retrieve).toHaveBeenCalledWith(
      expect.any(String),
      { patientIds: ["p2"] },
      expect.anything(),
    );
  });

  it("rejects a patient asking about another patient outside their scope", async () => {
    vi.mocked(resolveRetrievalScope).mockResolvedValue({ patientIds: ["p1"] } as never);

    await expect(assistant("their history", patientActor, "p9")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("requires a doctor to name the patient", async () => {
    vi.mocked(resolveRetrievalScope).mockResolvedValue({ patientIds: ["p1"] } as never);

    await expect(assistant("summarise", doctorActor)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("lets a doctor ask about a patient in their scope", async () => {
    vi.mocked(resolveRetrievalScope).mockResolvedValue({ patientIds: ["p1"] } as never);
    mockGenerate.mockResolvedValue({ answer: "Last visit was a fever follow-up." });

    const result = await assistant("what happened last visit?", doctorActor, "p1");

    expect(result.fallback).toBe(false);
    expect(retrieve).toHaveBeenCalledWith(
      expect.any(String),
      { patientIds: ["p1"] },
      expect.objectContaining({ feature: "doctor-assistant" }),
    );
  });

  it("rejects a doctor asking about a patient outside their scope", async () => {
    vi.mocked(resolveRetrievalScope).mockResolvedValue({ patientIds: ["p1"] } as never);

    await expect(assistant("their history", doctorActor, "p9")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("dedupes citations by source record", async () => {
    mockGenerate.mockResolvedValue({ answer: "You are on Aspirin." });

    const result = await assistant("medicines?", patientActor);

    expect(result.citations).toHaveLength(2);
    expect(result.citations.map((c) => c.sourceId).sort()).toEqual(["n1", "rx1"]);
  });

  it("answers without the model when nothing relevant is retrieved", async () => {
    vi.mocked(retrieve).mockResolvedValue([] as never);

    const result = await assistant("anything about an MRI?", patientActor);

    expect(result.fallback).toBe(false);
    expect(result.answer).toContain("couldn't find anything");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("returns an unavailable marker when AI is not configured", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(false);

    const result = await assistant("what medicines am I on?", patientActor);

    expect(result.fallback).toBe(true);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("falls back to retrieved excerpts when generation fails", async () => {
    mockGenerate.mockRejectedValue(new AiGenerationError("provider down"));

    const result = await assistant("what medicines am I on?", patientActor);

    expect(result.fallback).toBe(true);
    expect(result.answer).toContain("Aspirin");
    expect(logInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "patient-assistant", wasFallback: true }),
    );
  });

  it("serves a cached answer without retrieving or generating", async () => {
    vi.mocked(getCached).mockResolvedValue({
      answer: "Cached answer",
      citations: [],
      fallback: false,
    } as never);

    const result = await assistant("what medicines am I on?", patientActor);

    expect(result.answer).toBe("Cached answer");
    expect(retrieve).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("timelineSummary", () => {
  it("summarises for a patient in scope", async () => {
    vi.mocked(resolveRetrievalScope).mockResolvedValue({ patientIds: ["p1"] } as never);
    mockGenerate.mockResolvedValue({ summary: "Two visits, fever resolved." });

    const result = await timelineSummary("p1", patientActor);

    expect(result.fallback).toBe(false);
    expect(result.summary).toContain("fever");
    expect(retrieve).toHaveBeenCalledWith(
      expect.any(String),
      { patientIds: ["p1"] },
      expect.objectContaining({ feature: "timeline-summary" }),
    );
  });

  it("rejects when the caller has no scope for the patient", async () => {
    vi.mocked(resolveRetrievalScope).mockResolvedValue({ patientIds: ["p1"] } as never);

    await expect(timelineSummary("p9", patientActor)).rejects.toMatchObject({ statusCode: 403 });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("returns a marker when AI is unconfigured", async () => {
    vi.mocked(resolveRetrievalScope).mockResolvedValue({ patientIds: ["p1"] } as never);
    vi.mocked(isAiConfigured).mockReturnValue(false);

    const result = await timelineSummary("p1", patientActor);

    expect(result.fallback).toBe(true);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("semanticSearch", () => {
  it("returns cited chunks for a doctor", async () => {
    vi.mocked(resolveRetrievalScope).mockResolvedValue({ patientIds: ["p1"] } as never);

    const result = await semanticSearch("rising sugar", "p1", doctorActor, 5);

    expect(result.fallback).toBe(false);
    expect(result.results).toHaveLength(3);
    expect(result.results[0].sourceId).toBe("rx1");
    expect(retrieve).toHaveBeenCalledWith(
      "rising sugar",
      { patientIds: ["p1"] },
      expect.objectContaining({ k: 5 }),
    );
  });

  it("rejects a doctor with no scope for the patient", async () => {
    vi.mocked(resolveRetrievalScope).mockResolvedValue({ patientIds: ["p1"] } as never);

    await expect(semanticSearch("x", "p9", doctorActor)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("returns empty results when AI is unconfigured", async () => {
    vi.mocked(resolveRetrievalScope).mockResolvedValue({ patientIds: ["p1"] } as never);
    vi.mocked(isAiConfigured).mockReturnValue(false);

    const result = await semanticSearch("x", "p1", doctorActor);

    expect(result.fallback).toBe(true);
    expect(result.results).toEqual([]);
    expect(retrieve).not.toHaveBeenCalled();
  });
});
