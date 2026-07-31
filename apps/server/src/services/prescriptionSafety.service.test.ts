import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../config/db.js";
import { namesOverlap } from "./prescriptionSafety.service.js";

vi.mock("../config/db", () => ({
  prisma: {
    patientAllergy: { findMany: vi.fn() },
    prescriptionItem: { findMany: vi.fn() },
    drugInteraction: { findMany: vi.fn() },
  },
}));

describe("namesOverlap", () => {
  it("matches the same drug written with a dose", () => {
    expect(namesOverlap("Amoxicillin 500mg", "amoxicillin")).toBe(true);
  });

  it("matches a salt form against the base substance", () => {
    expect(namesOverlap("Amoxicillin trihydrate", "Amoxicillin")).toBe(true);
  });

  it("matches a compound containing the allergen", () => {
    expect(namesOverlap("co-amoxiclav amoxicillin", "amoxicillin")).toBe(true);
  });

  it("does not match unrelated drugs", () => {
    expect(namesOverlap("Paracetamol", "Amoxicillin")).toBe(false);
    expect(namesOverlap("Ibuprofen 200mg", "Warfarin")).toBe(false);
  });

  it("ignores short tokens so common words do not collide", () => {
    // "oral" / "acid" style noise must not create a false allergy match.
    expect(namesOverlap("Folic acid", "Mefenamic acid")).toBe(false);
  });
});

describe("checkPrescriptionSafety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.prescriptionItem.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.drugInteraction.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.patientAllergy.findMany).mockResolvedValue([] as never);
  });

  it("passes a prescription with no allergies or interactions", async () => {
    const { checkPrescriptionSafety } = await import("./prescriptionSafety.service.js");
    const report = await checkPrescriptionSafety("p1", ["Paracetamol 500mg"]);

    expect(report.safe).toBe(true);
    expect(report.blocking).toHaveLength(0);
  });

  it("BLOCKS a severe allergy match and offers no override", async () => {
    vi.mocked(prisma.patientAllergy.findMany).mockResolvedValue([
      { allergen: "Penicillin", severity: "SEVERE", reaction: "Anaphylaxis" },
    ] as never);

    const { checkPrescriptionSafety } = await import("./prescriptionSafety.service.js");
    const report = await checkPrescriptionSafety("p1", ["Penicillin V 250mg"]);

    expect(report.safe).toBe(false);
    expect(report.blocking).toHaveLength(1);
    expect(report.blocking[0]!.blocking).toBe(true);
    expect(report.acknowledgeable).toHaveLength(0);
  });

  it("lets a moderate allergy through as an acknowledgeable warning", async () => {
    vi.mocked(prisma.patientAllergy.findMany).mockResolvedValue([
      { allergen: "Aspirin", severity: "MODERATE", reaction: "Rash" },
    ] as never);

    const { checkPrescriptionSafety } = await import("./prescriptionSafety.service.js");
    const report = await checkPrescriptionSafety("p1", ["Aspirin 75mg"]);

    expect(report.blocking).toHaveLength(0);
    expect(report.acknowledgeable).toHaveLength(1);
    expect(report.safe).toBe(false);
  });

  it("flags an interaction between two newly prescribed drugs", async () => {
    vi.mocked(prisma.drugInteraction.findMany).mockResolvedValue([
      {
        drugA: "Warfarin",
        drugB: "Ibuprofen",
        severity: "SEVERE",
        description: "Increased bleeding risk",
      },
    ] as never);

    const { checkPrescriptionSafety } = await import("./prescriptionSafety.service.js");
    const report = await checkPrescriptionSafety("p1", ["Warfarin 5mg", "Ibuprofen 400mg"]);

    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]!.kind).toBe("interaction");
    // Interactions are a clinical judgement — acknowledgeable, not blocking.
    expect(report.blocking).toHaveLength(0);
  });

  it("flags an interaction against a medicine the patient already takes", async () => {
    vi.mocked(prisma.prescriptionItem.findMany).mockResolvedValue([
      { medicineName: "Warfarin 5mg" },
    ] as never);
    vi.mocked(prisma.drugInteraction.findMany).mockResolvedValue([
      {
        drugA: "Warfarin",
        drugB: "Ibuprofen",
        severity: "SEVERE",
        description: "Increased bleeding risk",
      },
    ] as never);

    const { checkPrescriptionSafety } = await import("./prescriptionSafety.service.js");
    // Only ibuprofen is being newly prescribed — the risk comes from existing therapy.
    const report = await checkPrescriptionSafety("p1", ["Ibuprofen 400mg"]);

    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]!.kind).toBe("interaction");
  });

  it("matches an interaction pair recorded in the opposite order", async () => {
    vi.mocked(prisma.drugInteraction.findMany).mockResolvedValue([
      {
        drugA: "Ibuprofen",
        drugB: "Warfarin",
        severity: "SEVERE",
        description: "Increased bleeding risk",
      },
    ] as never);

    const { checkPrescriptionSafety } = await import("./prescriptionSafety.service.js");
    const report = await checkPrescriptionSafety("p1", ["Warfarin 5mg", "Ibuprofen 400mg"]);

    expect(report.warnings).toHaveLength(1);
  });

  it("does not report the same interaction pair twice", async () => {
    vi.mocked(prisma.drugInteraction.findMany).mockResolvedValue([
      { drugA: "Warfarin", drugB: "Ibuprofen", severity: "SEVERE", description: "x" },
      { drugA: "Ibuprofen", drugB: "Warfarin", severity: "SEVERE", description: "x" },
    ] as never);

    const { checkPrescriptionSafety } = await import("./prescriptionSafety.service.js");
    const report = await checkPrescriptionSafety("p1", ["Warfarin 5mg", "Ibuprofen 400mg"]);

    expect(report.warnings).toHaveLength(1);
  });
});
