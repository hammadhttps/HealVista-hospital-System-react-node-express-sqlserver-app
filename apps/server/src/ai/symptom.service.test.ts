import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkSymptom, suggestDepartments, ruleBasedDepartmentSlugs } from "./symptom.service.js";
import { isAiConfigured } from "./index.js";
import { AiGenerationError } from "./guardrails.js";
import { logInteraction } from "./aiInteraction.service.js";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));

vi.mock("./index.js", () => ({
  getProvider: () => ({
    embed: vi.fn(),
    generate: mockGenerate,
    lastUsage: vi.fn(() => ({})),
  }),
  isAiConfigured: vi.fn(),
}));

vi.mock("./aiInteraction.service.js", () => ({ logInteraction: vi.fn() }));

const actor = { userId: "u1", role: "PATIENT" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("symptom → department rule map", () => {
  it("ranks matched departments by keyword frequency", () => {
    // "chest" and "pain" both hit general-medicine, so it ranks above cardiology/orthopedics.
    expect(ruleBasedDepartmentSlugs("chest pain")).toEqual([
      "general-medicine",
      "cardiology",
      "orthopedics",
    ]);
  });

  it("returns nothing when no keyword matches", () => {
    expect(ruleBasedDepartmentSlugs("purple toenail fluff")).toEqual([]);
  });
});

describe("suggestDepartments", () => {
  it("returns null without calling the provider when AI is not configured", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(false);

    const result = await suggestDepartments("chest pain", actor);

    expect(result).toBeNull();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("falls back to null when generation fails — the caller's rule map takes over", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(true);
    mockGenerate.mockRejectedValue(new AiGenerationError("provider down"));

    const result = await suggestDepartments("chest pain", actor);

    expect(result).toBeNull();
    expect(logInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "symptom-match", wasFallback: true }),
    );
  });

  it("returns Zod-validated suggestions on success", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(true);
    mockGenerate.mockResolvedValue({
      suggestions: [
        { slug: "cardiology", confidence: 0.9, reason: "chest pain warrants cardiac evaluation" },
      ],
    });

    const result = await suggestDepartments("chest pain", actor);

    expect(result).not.toBeNull();
    expect(result![0].slug).toBe("cardiology");
    expect(logInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "symptom-match", wasFallback: false }),
    );
  });
});

describe("checkSymptom", () => {
  it("short-circuits emergencies before any model call", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(true);

    const result = await checkSymptom("I have chest pain and can't breathe", actor);

    expect(result.type).toBe("emergency");
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.response).toContain("emergency services");
  });

  it("falls back to the rule map when the provider fails", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(true);
    mockGenerate.mockRejectedValue(new AiGenerationError("down"));

    const result = await checkSymptom("migraine every morning", actor);

    expect(result.type).toBe("department_suggestion");
    expect(result.department).toBe("neurology");
    expect(result.fallback).toBe(true);
  });

  it("uses the rule map when AI is not configured at all", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(false);

    const result = await checkSymptom("fever and a cough", actor);

    expect(result.type).toBe("department_suggestion");
    expect(result.department).toBe("general-medicine");
    expect(result.fallback).toBe(true);
  });

  it("gives general advice when neither the AI nor the rules can match", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(false);

    const result = await checkSymptom("my left shoelace keeps untying", actor);

    expect(result.type).toBe("general_advice");
    expect(result.department).toBeNull();
    expect(result.fallback).toBe(true);
  });

  it("returns the validated AI response on success", async () => {
    vi.mocked(isAiConfigured).mockReturnValue(true);
    mockGenerate.mockResolvedValue({
      type: "clarifying_question",
      response: "How long have you had this headache?",
      department: null,
      clarifyingQuestions: ["How long have you had this headache?"],
    });

    const result = await checkSymptom("headache for a few days", actor);

    expect(result.type).toBe("clarifying_question");
    expect(result.fallback).toBe(false);
    expect(result.response).toContain("headache");
  });
});
