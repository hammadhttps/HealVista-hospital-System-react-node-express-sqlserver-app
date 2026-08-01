import { describe, it, expect } from "vitest";
import { detectEmergency } from "./emergency.js";

describe("detectEmergency", () => {
  it("flags chest pain before any model call", () => {
    const r = detectEmergency("I have chest pain and it hurts when I breathe.");
    expect(r.isEmergency).toBe(true);
    expect(r.advice).toMatch(/chest/i);
  });

  it("flags breathing difficulty", () => {
    expect(detectEmergency("I can't breathe properly.").isEmergency).toBe(true);
    expect(detectEmergency("shortness of breath for an hour").isEmergency).toBe(true);
  });

  it("flags suicidal ideation", () => {
    const r = detectEmergency("I have been feeling suicidal lately.");
    expect(r.isEmergency).toBe(true);
  });

  it("flags stroke symptoms", () => {
    expect(detectEmergency("slurred speech and left arm weakness").isEmergency).toBe(true);
  });

  it("flags anaphylaxis signs", () => {
    expect(detectEmergency("swelling of the throat after the injection").isEmergency).toBe(true);
  });

  it("does not false-positive on ordinary symptoms", () => {
    const r = detectEmergency("I have had a mild headache and a sore throat for two days.");
    expect(r.isEmergency).toBe(false);
    expect(r.advice).toBeUndefined();
  });

  it("does not false-positive on 'chest' alone", () => {
    expect(detectEmergency("Chest X-ray ordered for follow-up").isEmergency).toBe(false);
  });

  it("handles empty input", () => {
    expect(detectEmergency("").isEmergency).toBe(false);
  });
});
