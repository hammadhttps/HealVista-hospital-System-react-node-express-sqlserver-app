import { z } from "zod";
import { getProvider, isAiConfigured } from "./index.js";
import { generateValidated, AiGenerationError } from "./guardrails.js";
import { stripPII } from "./pii.js";
import { detectEmergency } from "./emergency.js";
import { logInteraction } from "./aiInteraction.service.js";
import type { Actor } from "../services/access.service.js";

/**
 * Symptom → department matching and the stateless symptom checker (Phase 5.4).
 *
 * Two consumers share one rule map:
 *   - `suggestDepartments` upgrades Phase 2's `POST /api/doctors/match`. It tries
 *     Gemini first and falls back to the deterministic keyword map — the rule path
 *     stays intact so an AI outage changes nothing about a feature the front desk
 *     already depends on.
 *   - `checkSymptom` is the educational triage widget. Emergency phrases are caught
 *     by `detectEmergency` **before** any model call and short-circuit to an
 *     emergency-services message. Everything the model says is a *suggestion*, never
 *     a diagnosis, and the guardrail system prompt enforces that at generation time.
 */

/** The only department slugs the model may suggest — the seeded catalogue. */
export const KNOWN_DEPARTMENT_SLUGS = [
  "cardiology",
  "general-medicine",
  "pediatrics",
  "orthopedics",
  "neurology",
  "dermatology",
  "ophthalmology",
  "ent",
  "gynecology",
  "psychiatry",
  "emergency",
  "radiology",
] as const;

/** Keyword → department scoring, the deterministic non-AI path. */
const KEYWORD_DEPT_MAP: Record<string, string[]> = {
  heart: ["cardiology"],
  chest: ["cardiology", "general-medicine"],
  breath: ["cardiology", "general-medicine"],
  lung: ["general-medicine", "radiology"],
  cough: ["general-medicine", "pediatrics"],
  fever: ["general-medicine", "pediatrics"],
  child: ["pediatrics"],
  bone: ["orthopedics"],
  fracture: ["orthopedics"],
  joint: ["orthopedics"],
  spine: ["orthopedics", "neurology"],
  head: ["neurology"],
  brain: ["neurology"],
  migraine: ["neurology"],
  seizure: ["neurology"],
  skin: ["dermatology"],
  rash: ["dermatology"],
  hair: ["dermatology"],
  eye: ["ophthalmology"],
  vision: ["ophthalmology"],
  ear: ["ent"],
  hearing: ["ent"],
  throat: ["ent"],
  neck: ["ent"],
  pregnancy: ["gynecology"],
  menstrual: ["gynecology"],
  hormone: ["gynecology"],
  anxiety: ["psychiatry"],
  depression: ["psychiatry"],
  sleep: ["psychiatry"],
  mental: ["psychiatry"],
  pain: ["general-medicine", "orthopedics"],
  infection: ["general-medicine"],
  diabetes: ["general-medicine"],
  pressure: ["cardiology"],
  accident: ["emergency"],
  injury: ["emergency", "orthopedics"],
};

const MAX_RULE_MATCHES = 3;

/**
 * The deterministic keyword path, shared with doctor.service's match endpoint.
 * Returns up to `MAX_RULE_MATCHES` ranked slugs; empty when nothing matches.
 */
export function ruleBasedDepartmentSlugs(symptom: string): string[] {
  const keywords = symptom.toLowerCase().split(/\s+/);

  const departmentMatches: Record<string, number> = {};
  for (const kw of keywords) {
    const depts = KEYWORD_DEPT_MAP[kw];
    if (depts) {
      for (const d of depts) departmentMatches[d] = (departmentMatches[d] || 0) + 1;
    }
  }

  return Object.entries(departmentMatches)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_RULE_MATCHES)
    .map(([slug]) => slug);
}

// ─── AI department suggestions (doctors/match upgrade) ─────────────────────

const departmentSuggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        slug: z.string().min(1).max(100),
        confidence: z.number().min(0).max(1),
        reason: z.string().max(300),
      }),
    )
    .max(5),
});

export interface DepartmentSuggestion {
  slug: string;
  confidence: number;
  reason: string;
}

/**
 * AI-ranked department suggestions for a symptom. Returns `null` when the AI path
 * is unavailable (not configured, or generation failed) — the caller then runs the
 * deterministic rule map. Never a hard failure.
 */
export async function suggestDepartments(
  symptom: string,
  actor?: Actor,
): Promise<DepartmentSuggestion[] | null> {
  if (!isAiConfigured()) return null;

  const prompt = [
    `A patient describes this symptom: "${stripPII(symptom)}"`,
    "Recommend up to 3 departments a patient should consider seeing.",
    `You may only choose slugs from this list: ${KNOWN_DEPARTMENT_SLUGS.join(", ")}.`,
    "Rank by likelihood and give a one-line reason. Never name a condition as a fact.",
  ].join("\n");

  try {
    const result = await generateValidated(getProvider(), {
      feature: "symptom-match",
      prompt,
      schema: departmentSuggestionSchema,
      system:
        "This is a specialty-referral suggestion, not a diagnosis. If the symptom sounds urgent, the department list includes 'emergency'.",
      maxTokens: 512,
    });

    const usage = getProvider().lastUsage();
    if (actor) {
      await logInteraction({
        userId: actor.userId,
        feature: "symptom-match",
        question: symptom,
        responseRef: JSON.stringify(result.suggestions.slice(0, 3)),
        latencyMs: usage.latencyMs,
        tokensUsed: usage.tokensUsed,
        wasFallback: false,
      });
    }

    return result.suggestions;
  } catch {
    if (actor) {
      await logInteraction({
        userId: actor.userId,
        feature: "symptom-match",
        question: symptom,
        wasFallback: true,
      });
    }
    return null;
  }
}

// ─── Symptom checker ────────────────────────────────────────────────────────

const symptomCheckOutputSchema = z.object({
  type: z.enum(["clarifying_question", "department_suggestion", "general_advice"]),
  response: z.string().min(1).max(1000),
  department: z.string().min(1).max(100).nullable(),
  clarifyingQuestions: z.array(z.string().max(200)).max(3).nullable(),
});

export type SymptomCheckResult =
  | {
      type: "emergency";
      response: string;
      department: null;
      clarifyingQuestions: [];
      fallback: false;
    }
  | {
      type: "clarifying_question" | "department_suggestion" | "general_advice";
      response: string;
      department: string | null;
      clarifyingQuestions: string[];
      fallback: boolean;
    };

const EMERGENCY_LINE =
  "Please stop and contact emergency services immediately. If you are with someone, ask them to call for you.";

/**
 * A stateless triage turn. Emergency phrasing is detected deterministically and
 * short-circuits the model entirely (ai-rag.md §6). Everything else is either an
 * AI response or the rule-map fallback — educational framing only, no diagnosis.
 */
export async function checkSymptom(message: string, actor: Actor): Promise<SymptomCheckResult> {
  const emergency = detectEmergency(message);
  if (emergency.isEmergency) {
    await logInteraction({
      userId: actor.userId,
      feature: "symptom-check",
      question: message,
      responseRef: emergency.advice,
      wasFallback: false,
    });
    return {
      type: "emergency",
      response: `${emergency.advice} ${EMERGENCY_LINE}`,
      department: null,
      clarifyingQuestions: [],
      fallback: false,
    };
  }

  if (!isAiConfigured()) return ruleFallback(message, actor);

  try {
    const result = await generateValidated(getProvider(), {
      feature: "symptom-check",
      prompt: `The patient reports: "${stripPII(message)}"\n\nRespond as a triage assistant: ask a clarifying question, suggest a department, or give general advice. Educational framing only.`,
      schema: symptomCheckOutputSchema,
      maxTokens: 512,
    });

    const usage = getProvider().lastUsage();
    await logInteraction({
      userId: actor.userId,
      feature: "symptom-check",
      question: message,
      responseRef: result.response,
      latencyMs: usage.latencyMs,
      tokensUsed: usage.tokensUsed,
      wasFallback: false,
    });

    return {
      type: result.type,
      response: result.response,
      department: result.department,
      clarifyingQuestions: result.clarifyingQuestions ?? [],
      fallback: false,
    };
  } catch (err) {
    if (!(err instanceof AiGenerationError)) throw err;
    return ruleFallback(message, actor);
  }
}

async function ruleFallback(message: string, actor: Actor): Promise<SymptomCheckResult> {
  const slugs = ruleBasedDepartmentSlugs(message);
  let response: string;
  let type: "department_suggestion" | "general_advice";
  let department: string | null;

  if (slugs.length > 0) {
    type = "department_suggestion";
    department = slugs[0];
    response = `Based on your description, seeing a ${slugs[0].replace("-", " ")} specialist may help. This is only a suggestion — please confirm with a doctor.`;
  } else {
    type = "general_advice";
    department = null;
    response =
      "I couldn't match your description to a department. Please describe your symptoms in more detail, or consult a doctor directly.";
  }

  await logInteraction({
    userId: actor.userId,
    feature: "symptom-check",
    question: message,
    responseRef: response,
    wasFallback: true,
  });

  return { type, response, department, clarifyingQuestions: [], fallback: true };
}
