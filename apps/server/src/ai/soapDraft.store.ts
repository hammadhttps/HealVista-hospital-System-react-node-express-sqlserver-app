import { getCached, setCached, redis } from "../config/redis.js";

/**
 * Where generated SOAP drafts live between "draft with AI" and "save".
 *
 * The draft must persist *nothing* to the clinical record until the doctor edits
 * and submits it — but the "unedited draft cannot be submitted" rule (Phase 5.4)
 * needs the server to know what the draft was. Redis is the compromise: an
 * ephemeral cache keyed by appointment, TTL a day, gone on restart. When Redis is
 * unavailable the draft simply isn't enforceable, which degrades the guardrail
 * without breaking the feature.
 */

export interface SoapDraft {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  source: "ai" | "rules";
  createdAt: string;
}

const DRAFT_TTL_SEC = 24 * 60 * 60;

function draftKey(appointmentId: string): string {
  return `ai:draft:${appointmentId}`;
}

export async function storeDraft(appointmentId: string, draft: SoapDraft): Promise<void> {
  await setCached(draftKey(appointmentId), draft, DRAFT_TTL_SEC);
}

export async function getStoredDraft(appointmentId: string): Promise<SoapDraft | null> {
  return getCached<SoapDraft>(draftKey(appointmentId));
}

export async function clearStoredDraft(appointmentId: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(draftKey(appointmentId));
  } catch {
    // silent — clearing is best-effort
  }
}

/** The note sections the editor can submit, as the unedited check needs them. */
export interface NoteDraftInput {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

/**
 * True when the submitted note is byte-identical to the AI draft — i.e. the doctor
 * clicked "draft with AI" and then submitted it without reviewing. Any change to
 * any section means it was reviewed; the check is intentionally all-or-nothing.
 */
export function isUneditedDraft(input: NoteDraftInput, draft: SoapDraft): boolean {
  return (
    (input.subjective ?? "") === draft.subjective &&
    (input.objective ?? "") === draft.objective &&
    (input.assessment ?? "") === draft.assessment &&
    (input.plan ?? "") === draft.plan
  );
}
