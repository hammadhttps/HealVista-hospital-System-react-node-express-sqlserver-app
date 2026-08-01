import { describe, it, expect } from "vitest";
import { stripPII, PII_TEST_TOKENS as T } from "./pii.js";

/**
 * PII stripping is the control that makes sending clinical text to an external
 * LLM acceptable at all. These tests pin the failure modes that matter: a name
 * in body text, an email quoted mid-sentence, a phone in a contact field, an MRN,
 * a DOB — and that legitimate clinical content survives intact.
 */
describe("stripPII", () => {
  it("removes an email from body text", () => {
    const out = stripPII("Contact john.doe@example.com if results are abnormal.");
    expect(out).not.toContain("john.doe@example.com");
    expect(out).toContain(T.REDACTED_EMAIL);
    expect(out).toContain("results are abnormal");
  });

  it("removes phone numbers in common formats", () => {
    expect(stripPII("Call 0300-1234567 for an appointment.")).toContain(T.REDACTED_PHONE);
    expect(stripPII("Reach +92 300 1234567.")).toContain(T.REDACTED_PHONE);
    expect(stripPII("Office (021) 3456 7890.")).toContain(T.REDACTED_PHONE);
  });

  it("removes national ids and MRNs", () => {
    expect(stripPII("CNIC 42101-2345678-9 on file")).toContain(T.REDACTED_ID);
    expect(stripPII("SSN 123-45-6789")).toContain(T.REDACTED_ID);
    expect(stripPII("MRN 4581 on admission")).toContain(T.REDACTED_ID);
  });

  it("removes labelled dates of birth", () => {
    const out = stripPII("Patient DOB: 1990-05-17, presented with fever.");
    expect(out).not.toContain("1990-05-17");
    expect(out).toContain(T.REDACTED_DATE);
  });

  it("removes a standalone given name in body text", () => {
    const out = stripPII("John called yesterday about his test results.");
    expect(out).not.toContain("John");
    expect(out).toContain(T.REDACTED_NAME);
  });

  it("removes a title-led full name", () => {
    const out = stripPII("Referred to Dr. Ayesha Khan at cardiology.");
    expect(out).not.toContain("Ayesha");
    expect(out).not.toContain("Khan");
  });

  it("removes a labelled patient name", () => {
    const out = stripPII("Patient: James Wilson, 45M, came in with a rash.");
    expect(out).not.toContain("James");
    expect(out).not.toContain("Wilson");
  });

  it("keeps legitimate clinical content intact", () => {
    const input = "Patient presented with chest pain, BP 140/90, Rx: paracetamol 500mg TDS.";
    const out = stripPII(input);
    expect(out).toContain("chest pain");
    expect(out).toContain("140/90");
    expect(out).toContain("paracetamol");
    expect(out).toContain("TDS");
  });

  it("keeps medical terminology that happens to start with capital letters", () => {
    const out = stripPII("CBC shows Hemoglobin 12.1, WBC elevated.");
    expect(out).toContain("CBC");
    expect(out).toContain("Hemoglobin");
    expect(out).toContain("WBC");
  });

  it("handles empty input", () => {
    expect(stripPII("")).toBe("");
    expect(stripPII(null as unknown as string)).toBe(null as unknown as string);
  });
});
