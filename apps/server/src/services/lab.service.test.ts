import { describe, it, expect } from "vitest";
import { canSeeResults } from "./lab.service.js";

/**
 * Result visibility is the rule with the worst failure mode in this module: a patient
 * reading an unverified critical potassium believes they are dying. It is pinned here
 * for every status, not just the interesting one.
 */
describe("lab result visibility", () => {
  const statuses = ["ORDERED", "SAMPLE_COLLECTED", "TESTING", "COMPLETED", "CANCELLED"];

  it("hides results from a patient until the order is VERIFIED", () => {
    for (const status of statuses) {
      expect(canSeeResults("PATIENT", status)).toBe(false);
    }
  });

  it("hides a COMPLETED result from a patient — measured is not verified", () => {
    // The single most likely mistake: treating COMPLETED as "ready for the patient".
    expect(canSeeResults("PATIENT", "COMPLETED")).toBe(false);
  });

  it("releases results to a patient once VERIFIED", () => {
    expect(canSeeResults("PATIENT", "VERIFIED")).toBe(true);
  });

  it("shows unverified results to clinicians and lab staff", () => {
    // They must be able to act on a critical value before a pathologist signs it off.
    for (const role of ["DOCTOR", "LAB_TECHNICIAN", "ADMIN"]) {
      expect(canSeeResults(role, "COMPLETED")).toBe(true);
    }
  });
});
