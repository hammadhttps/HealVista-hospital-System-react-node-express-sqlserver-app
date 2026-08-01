import { z } from "zod";
import { prisma } from "../config/db.js";
import { getProvider, isAiConfigured } from "./index.js";
import { generateValidated, AiGenerationError } from "./guardrails.js";
import { stripPII } from "./pii.js";
import { logInteraction } from "./aiInteraction.service.js";
import { answerCacheKey, getCachedAnswer, setCachedAnswer } from "./answerCache.js";
import type { Actor } from "../services/access.service.js";

/**
 * Analytics assistant (Phase 5.5) — ADMIN only.
 *
 * The model **never authors SQL**. A fixed registry of parameterised aggregate
 * queries is selected by classifying the question (Gemini first, keyword fallback);
 * the backend runs that query; Gemini then narrates the numbers. Every value is
 * parameterised via Prisma's tagged-template quoting, so `days` is injected as a
 * bound parameter, never interpolated.
 */

export type AnalyticsIntent =
  | "revenue_by_period"
  | "appointments_by_status"
  | "no_show_rate"
  | "top_departments"
  | "new_patients";

export interface AnalyticsTable {
  columns: string[];
  rows: Record<string, string | number | null>[];
}

export interface AnalyticsResult {
  intent: AnalyticsIntent;
  answer: string | null;
  table: AnalyticsTable;
  fallback: boolean;
}

interface AnalyticsQueryDef {
  key: AnalyticsIntent;
  label: string;
  keywords: string[];
  run: (days: number) => Promise<AnalyticsTable>;
}

const QUERIES: Record<AnalyticsIntent, AnalyticsQueryDef> = {
  revenue_by_period: {
    key: "revenue_by_period",
    label: "Revenue by day",
    keywords: ["revenue", "income", "collected", "payment", "earn", "money", "cash"],
    run: async (days) => {
      const rows = await prisma.$queryRaw<
        Array<{ day: Date | string; collected: string }>
      >`SELECT date_trunc('day', p.created_at)::date AS day,
            sum(p.amount)::numeric(12, 2) AS collected
         FROM payments p
         WHERE p.status = 'SUCCEEDED'
           AND p.created_at >= now() - (${days} * interval '1 day')
         GROUP BY 1 ORDER BY 1 DESC LIMIT 30`;
      return {
        columns: ["day", "collected"],
        rows: rows.map((r) => ({ day: String(r.day), collected: String(r.collected) })),
      };
    },
  },
  appointments_by_status: {
    key: "appointments_by_status",
    label: "Appointments by status",
    keywords: ["appointment", "booking", "scheduled", "confirmed", "cancelled", "waiting"],
    run: async (days) => {
      const rows = await prisma.$queryRaw<
        Array<{ status: string; count: bigint }>
      >`SELECT a.status AS status, count(*) AS count
         FROM appointments a
         WHERE a.deleted_at IS NULL
           AND a.created_at >= now() - (${days} * interval '1 day')
         GROUP BY 1 ORDER BY count DESC`;
      return {
        columns: ["status", "count"],
        rows: rows.map((r) => ({ status: String(r.status), count: String(r.count) })),
      };
    },
  },
  no_show_rate: {
    key: "no_show_rate",
    label: "No-show rate",
    keywords: ["no-show", "no show", "noshow", "missed", "did not show", "didn't show"],
    run: async (days) => {
      const rows = await prisma.$queryRaw<
        Array<{ no_shows: bigint; total: bigint }>
      >`SELECT count(*) FILTER (WHERE a.status = 'NO_SHOW') AS no_shows,
            count(*) AS total
         FROM appointments a
         WHERE a.deleted_at IS NULL
           AND a.created_at >= now() - (${days} * interval '1 day')`;
      const row = rows[0];
      const total = row ? Number(row.total) : 0;
      const noShows = row ? Number(row.no_shows) : 0;
      return {
        columns: ["no_shows", "total", "rate"],
        rows: [
          {
            no_shows: String(noShows),
            total: String(total),
            rate: total > 0 ? `${((noShows / total) * 100).toFixed(1)}%` : "0.0%",
          },
        ],
      };
    },
  },
  top_departments: {
    key: "top_departments",
    label: "Busiest departments",
    keywords: ["department", "specialty", "speciality", "busiest", "popular"],
    run: async (days) => {
      const rows = await prisma.$queryRaw<
        Array<{ department: string | null; appointments: bigint }>
      >`SELECT COALESCE(d.name, 'Unassigned') AS department, count(*) AS appointments
         FROM appointments a
         LEFT JOIN departments d ON d.id = a.department_id
         WHERE a.deleted_at IS NULL
           AND a.created_at >= now() - (${days} * interval '1 day')
         GROUP BY 1 ORDER BY appointments DESC LIMIT 5`;
      return {
        columns: ["department", "appointments"],
        rows: rows.map((r) => ({
          department: r.department ?? "Unassigned",
          appointments: String(r.appointments),
        })),
      };
    },
  },
  new_patients: {
    key: "new_patients",
    label: "New patient registrations",
    keywords: ["new patient", "registration", "registered", "signup", "joined"],
    run: async (days) => {
      const rows = await prisma.$queryRaw<
        Array<{ day: Date | string; patients: bigint }>
      >`SELECT date_trunc('day', p.created_at)::date AS day, count(*) AS patients
         FROM patients p
         WHERE p.deleted_at IS NULL
           AND p.created_at >= now() - (${days} * interval '1 day')
         GROUP BY 1 ORDER BY 1 DESC LIMIT 30`;
      return {
        columns: ["day", "patients"],
        rows: rows.map((r) => ({ day: String(r.day), patients: String(r.patients) })),
      };
    },
  },
};

function parseDays(question: string): number {
  const m = question.toLowerCase().match(/(\d+)\s*(day|week|month)s?\b/);
  let days = 30;
  if (m) {
    const n = parseInt(m[1], 10);
    days = m[2].startsWith("week") ? n * 7 : m[2].startsWith("month") ? n * 30 : n;
  }
  return Math.min(Math.max(days, 1), 3650);
}

const intentKeys: AnalyticsIntent[] = [
  "revenue_by_period",
  "appointments_by_status",
  "no_show_rate",
  "top_departments",
  "new_patients",
];

function keywordIntent(question: string): AnalyticsIntent {
  const q = question.toLowerCase();
  for (const key of intentKeys) {
    if (QUERIES[key].keywords.some((kw) => q.includes(kw))) return key;
  }
  return "appointments_by_status";
}

const intentSchema = z.object({
  intent: z.enum(intentKeys as [AnalyticsIntent, ...AnalyticsIntent[]]),
});

async function classifyIntent(question: string): Promise<AnalyticsIntent> {
  if (!isAiConfigured()) return keywordIntent(question);
  try {
    const result = await generateValidated(getProvider(), {
      feature: "analytics-intent",
      prompt: `Pick the single analytics intent that best answers this question: "${stripPII(question)}".`,
      schema: intentSchema,
      system:
        "Map the question to one of the available analytics queries. Reply with only the intent key.",
      maxTokens: 64,
    });
    return result.intent;
  } catch {
    return keywordIntent(question);
  }
}

const narrationSchema = z.object({
  answer: z.string().min(1).max(3000),
});

/**
 * Answers an admin's operations question: classify → run parameterised SQL →
 * narrate the numbers. `fallback` stays true when the narration (or classification)
 * had no model — the table alone is still a useful answer.
 */
export async function runAnalyticsQuestion(
  question: string,
  actor: Actor,
): Promise<AnalyticsResult> {
  const cacheKey = answerCacheKey("analytics", question.trim().toLowerCase());
  const cached = await getCachedAnswer<AnalyticsResult>(cacheKey);
  if (cached) return cached;

  const intent = await classifyIntent(question);
  const table = await QUERIES[intent].run(parseDays(question));

  let answer: string | null = null;
  let fallback = !isAiConfigured();

  if (!fallback) {
    try {
      const result = await generateValidated(getProvider(), {
        feature: "analytics-narration",
        prompt: `Question: "${stripPII(question)}"\n\nQuery results (columns: ${table.columns.join(", ")}):\n${table.rows
          .map((r) => JSON.stringify(r))
          .join("\n")}\n\nNarrate the numbers in plain language.`,
        schema: narrationSchema,
        system:
          "You are an operations analyst. Summarise what the numbers show. Never invent numbers not in the results.",
        maxTokens: 512,
      });
      answer = result.answer;
      const usage = getProvider().lastUsage();
      await logInteraction({
        userId: actor.userId,
        feature: "analytics-assistant",
        question,
        responseRef: answer,
        latencyMs: usage.latencyMs,
        tokensUsed: usage.tokensUsed,
        wasFallback: false,
      });
    } catch (err) {
      if (!(err instanceof AiGenerationError)) throw err;
      fallback = true;
      await logInteraction({
        userId: actor.userId,
        feature: "analytics-assistant",
        question,
        wasFallback: true,
      });
    }
  } else {
    await logInteraction({
      userId: actor.userId,
      feature: "analytics-assistant",
      question,
      wasFallback: true,
    });
  }

  const out: AnalyticsResult = { intent, answer, table, fallback };
  if (!fallback) await setCachedAnswer(cacheKey, out);
  return out;
}
