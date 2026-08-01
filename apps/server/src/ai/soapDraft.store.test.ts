import { describe, it, expect, vi } from "vitest";
import { isUneditedDraft, type SoapDraft } from "./soapDraft.store.js";

vi.mock("../config/redis.js", () => ({ redis: null, getCached: vi.fn(), setCached: vi.fn() }));

/**
 * The "unedited AI draft cannot be submitted" rule (Phase 5.7 test list).
 *
 * The draft is returned to the editor as unsaved content; when the doctor submits
 * it with `aiAssisted: true`, the server compares against the stored draft and
 * rejects a byte-identical submission. Any edit to any section means the doctor
 * reviewed it — the check is deliberately all-or-nothing so a single keystroke is
 * enough to prove the human was in the loop.
 */
describe("isUneditedDraft", () => {
  const draft: SoapDraft = {
    subjective: "Patient presents with fever and body aches",
    objective: "Temp 38.5C, HR 92",
    assessment: "Fever, likely viral",
    plan: "Rest, fluids, paracetamol as needed",
    source: "ai",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("rejects a note submitted verbatim from the AI draft", () => {
    expect(isUneditedDraft({ ...draft }, draft)).toBe(true);
  });

  it("accepts the note once any single section is edited", () => {
    expect(isUneditedDraft({ ...draft, plan: "Rest, fluids, review in 3 days" }, draft)).toBe(
      false,
    );
  });

  it("accepts the note when the assessment is rewritten", () => {
    expect(
      isUneditedDraft({ ...draft, assessment: "Viral illness — monitor for worsening" }, draft),
    ).toBe(false);
  });

  it("accepts a note where a section is dropped rather than copied verbatim", () => {
    // Submitting only the unchanged subjective section is not "the draft" — the
    // rest of the note differs and must still be filled in by the doctor.
    expect(isUneditedDraft({ subjective: draft.subjective }, draft)).toBe(false);
  });

  it("treats an empty draft submitted as-is as unedited", () => {
    const emptyDraft: SoapDraft = {
      ...draft,
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
    };
    expect(isUneditedDraft({}, emptyDraft)).toBe(true);
  });

  it("accepts a completely hand-written note that happens to share a section", () => {
    expect(isUneditedDraft({ subjective: draft.subjective }, { ...draft, objective: "" })).toBe(
      false,
    );
  });
});
