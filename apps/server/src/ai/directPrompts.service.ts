import { z } from "zod";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import { addSummaryJob } from "../config/bull.js";
import {
  assertClinicalAccess,
  assertNoteReadAccess,
  type Actor,
} from "../services/access.service.js";
import { assertTreatingDoctor } from "../services/note.service.js";
import { signDeliveryUrl } from "../services/record.service.js";
import { getProvider, isAiConfigured } from "./index.js";
import { generateValidated, AiGenerationError } from "./guardrails.js";
import { stripPII } from "./pii.js";
import { logInteraction } from "./aiInteraction.service.js";

/**
 * Direct-prompt features (Phase 5.4) — data the caller already holds, no retrieval.
 *
 * Every function here follows the same shape: load → **PII-strip before any
 * outbound call** → `generateValidated` (Zod-validated, one retry) → log the
 * `AiInteraction` → return. Every path has a non-AI fallback: when the provider is
 * unconfigured or generation fails, the caller still gets a successful, usable
 * response with `fallback: true` — never a hard failure.
 *
 * Report summaries are the one queued feature (free-tier burst shaping): the worker
 * in `workers/summaries.worker.ts` calls `summarizeRecord`, which writes
 * `MedicalRecord.aiSummary`.
 */

const MAX_SUMMARY_CHARS = 30_000;

// ─── Lab report explanation ──────────────────────────────────────────────────

const labExplainOutputSchema = z.object({
  explanation: z.string().min(1).max(3000),
  highlights: z
    .array(
      z.object({
        test: z.string().min(1).max(200),
        value: z.string().min(1).max(200),
        flag: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).nullable(),
        note: z.string().min(1).max(400),
      }),
    )
    .max(40),
});

export interface LabExplainResult {
  explanation: string | null;
  highlights: Array<{ test: string; value: string; flag: string | null; note: string }>;
  fallback: boolean;
}

export async function explainLabReport(orderId: string, actor: Actor): Promise<LabExplainResult> {
  const order = await prisma.labOrder.findUnique({
    where: { id: orderId },
    include: { items: { include: { labTest: { select: { name: true, code: true } } } } },
  });
  if (!order) throw new AppError("Lab order not found", 404);
  await assertClinicalAccess(order.patientId, actor);

  const items = order.items.filter((i) => i.resultValue && i.resultValue.trim());
  if (items.length === 0) {
    throw new AppError("There are no result values to explain yet", 400);
  }

  const highlights = items.map((i) => ({
    test: i.labTest.name,
    value: i.resultValue ?? "",
    flag: i.flag ?? null,
    note: i.referenceRange ? `Reference range: ${i.referenceRange}` : "",
  }));

  const fail = async (): Promise<LabExplainResult> => {
    await logInteraction({
      userId: actor.userId,
      feature: "lab-explain",
      question: orderId,
      wasFallback: true,
    });
    return { explanation: null, highlights, fallback: true };
  };

  if (!isAiConfigured()) return fail();

  const lines = items.map(
    (i) =>
      `${i.labTest.code} ${i.labTest.name}: ${i.resultValue} ${i.unit ?? ""}${i.referenceRange ? ` (ref ${i.referenceRange})` : ""}${i.flag ? ` [${i.flag}]` : ""}`,
  );
  const prompt = [
    "Explain these laboratory results to a patient in plain language.",
    "For each value, say what the test measures and what the result means in everyday terms.",
    "Never name a condition as a fact. Never contradict what the report itself shows.",
    "When a value is outside its reference range, say it is flagged and that the treating doctor will interpret it.",
    ...lines,
  ].join("\n");

  try {
    const result = await generateValidated(getProvider(), {
      feature: "lab-explain",
      prompt: stripPII(prompt),
      schema: labExplainOutputSchema,
      maxTokens: 1024,
    });

    const usage = getProvider().lastUsage();
    await logInteraction({
      userId: actor.userId,
      feature: "lab-explain",
      question: orderId,
      responseRef: result.explanation,
      latencyMs: usage.latencyMs,
      tokensUsed: usage.tokensUsed,
      wasFallback: false,
    });
    return { explanation: result.explanation, highlights: result.highlights, fallback: false };
  } catch (err) {
    if (!(err instanceof AiGenerationError)) throw err;
    return fail();
  }
}

// ─── Prescription explanation ────────────────────────────────────────────────

const rxExplainOutputSchema = z.object({
  purpose: z.string().min(1).max(500),
  howToTake: z.string().min(1).max(800),
  sideEffects: z.array(z.string().min(1).max(200)).max(15),
  lifestyleNotes: z.array(z.string().min(1).max(200)).max(10),
  warnings: z.array(z.string().min(1).max(200)).max(10),
});

export interface RxExplainResult {
  purpose: string | null;
  howToTake: string | null;
  sideEffects: string[];
  lifestyleNotes: string[];
  warnings: string[];
  fallback: boolean;
}

export async function explainPrescription(
  prescriptionId: string,
  actor: Actor,
): Promise<RxExplainResult> {
  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: { items: true, appointment: { select: { patientId: true } } },
  });
  if (!prescription || prescription.deletedAt) throw new AppError("Prescription not found", 404);
  if (prescription.isDraft) throw new AppError("Draft prescriptions cannot be explained", 400);
  await assertClinicalAccess(prescription.appointment.patientId, actor);

  const empty: RxExplainResult = {
    purpose: null,
    howToTake: null,
    sideEffects: [],
    lifestyleNotes: [],
    warnings: [],
    fallback: true,
  };
  const fail = async (): Promise<RxExplainResult> => {
    await logInteraction({
      userId: actor.userId,
      feature: "rx-explain",
      question: prescriptionId,
      wasFallback: true,
    });
    return empty;
  };

  if (!isAiConfigured()) return fail();

  const lines = prescription.items.map(
    (i) =>
      `${i.medicineName} — ${i.dosage}, ${i.frequency} for ${i.durationDays} day(s)${i.instructions ? ` (${i.instructions})` : ""}`,
  );
  const prompt = [
    "Explain this prescription to the patient taking it.",
    "For each medicine: why it might be prescribed, how to take it, possible side effects, and lifestyle notes.",
    "Never name a condition as a fact. If the purpose is not clear from the prescription, say so rather than guessing.",
    ...lines,
    prescription.notes ? `Prescription notes: ${prescription.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await generateValidated(getProvider(), {
      feature: "rx-explain",
      prompt: stripPII(prompt),
      schema: rxExplainOutputSchema,
      maxTokens: 1024,
    });

    const usage = getProvider().lastUsage();
    await logInteraction({
      userId: actor.userId,
      feature: "rx-explain",
      question: prescriptionId,
      responseRef: result.howToTake,
      latencyMs: usage.latencyMs,
      tokensUsed: usage.tokensUsed,
      wasFallback: false,
    });
    return {
      purpose: result.purpose,
      howToTake: result.howToTake,
      sideEffects: result.sideEffects,
      lifestyleNotes: result.lifestyleNotes,
      warnings: result.warnings,
      fallback: false,
    };
  } catch (err) {
    if (!(err instanceof AiGenerationError)) throw err;
    return fail();
  }
}

// ─── Follow-up recommendation ────────────────────────────────────────────────

const followUpOutputSchema = z.object({
  intervalDays: z.number().int().min(1).max(365),
  instructions: z.string().min(1).max(1500),
  rationale: z.string().min(1).max(1500),
});

export interface FollowUpResult {
  intervalDays: number | null;
  instructions: string | null;
  rationale: string | null;
  fallback: boolean;
}

export async function recommendFollowUp(
  appointmentId: string,
  actor: Actor,
): Promise<FollowUpResult> {
  // Only the treating doctor asks for a follow-up recommendation on their own visit.
  await assertTreatingDoctor(appointmentId, actor);

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      note: true,
      prescription: { include: { items: true } },
    },
  });
  if (!appointment) throw new AppError("Appointment not found", 404);

  const labs = await prisma.labOrder.findMany({
    where: { patientId: appointment.patientId, status: "VERIFIED" },
    include: { items: { include: { labTest: { select: { name: true, code: true } } } } },
    orderBy: { verifiedAt: "desc" },
    take: 3,
  });

  const fail = async (): Promise<FollowUpResult> => {
    await logInteraction({
      userId: actor.userId,
      feature: "follow-up",
      question: appointmentId,
      wasFallback: true,
    });
    return { intervalDays: null, instructions: null, rationale: null, fallback: true };
  };
  if (!isAiConfigured()) return fail();

  const note = appointment.note;
  const noteText = note
    ? `Assessment: ${note.assessment}\nPlan: ${note.plan}`
    : "No signed note for this visit yet.";
  const rxText = appointment.prescription
    ? appointment.prescription.items
        .map((i) => `${i.medicineName} — ${i.dosage} ${i.frequency} for ${i.durationDays} day(s)`)
        .join("\n")
    : "No prescription.";
  const labText =
    labs.length > 0
      ? labs
          .map((o) =>
            o.items
              .map(
                (i) =>
                  `${i.labTest.name}: ${i.resultValue ?? "pending"} ${i.unit ?? ""} [${i.flag ?? "N/A"}]`,
              )
              .join(", "),
          )
          .join("\n")
      : "No verified lab results.";

  const prompt = [
    "Recommend a follow-up interval for this patient based on the consultation below.",
    "Return the number of days, concrete instructions for the follow-up, and a one-paragraph rationale grounded in the provided content.",
    "If the information does not support a recommendation, say so in the rationale rather than inventing one.",
    "This is a suggestion for the treating doctor to confirm — never a diagnosis.",
    `Complaint as recorded: ${appointment.reasonNote ?? "not recorded"}`,
    `Note: ${noteText}`,
    `Prescription: ${rxText}`,
    `Recent verified labs: ${labText}`,
  ].join("\n");

  try {
    const result = await generateValidated(getProvider(), {
      feature: "follow-up",
      prompt: stripPII(prompt),
      schema: followUpOutputSchema,
      maxTokens: 1024,
    });

    const usage = getProvider().lastUsage();
    await logInteraction({
      userId: actor.userId,
      feature: "follow-up",
      question: appointmentId,
      responseRef: result.instructions,
      latencyMs: usage.latencyMs,
      tokensUsed: usage.tokensUsed,
      wasFallback: false,
    });
    return {
      intervalDays: result.intervalDays,
      instructions: result.instructions,
      rationale: result.rationale,
      fallback: false,
    };
  } catch (err) {
    if (!(err instanceof AiGenerationError)) throw err;
    return fail();
  }
}

// ─── OCR summary ─────────────────────────────────────────────────────────────

const ocrOutputSchema = z.object({
  extractedText: z.string().min(1).max(10000),
  summary: z.string().min(1).max(2000),
});

export interface OcrResult {
  extractedText: string | null;
  summary: string | null;
  fallback: boolean;
}

const OCR_IMAGE_TYPES = ["png", "jpeg", "jpg"];

/**
 * Jina vision over a photographed report (handwritten prescription, scanned
 * lab sheet). The image is downloaded server-side behind its short-lived signed
 * URL and sent inline as base64 — the signed URL never leaves the server and
 * nothing is persisted. On any failure the caller keeps the original image and
 * simply sees "AI unavailable" — opening the record still works.
 */
export async function ocrRecord(recordId: string, actor: Actor): Promise<OcrResult> {
  const record = await prisma.medicalRecord.findUnique({ where: { id: recordId } });
  if (!record || record.deletedAt) throw new AppError("Record not found", 404);
  await assertClinicalAccess(record.patientId, actor);

  if (!OCR_IMAGE_TYPES.includes(record.fileType.toLowerCase())) {
    throw new AppError("Only image records (PNG/JPEG) can be OCR'd", 400);
  }

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "MEDICAL_RECORD_OCR",
    targetType: "medical_record",
    targetId: recordId,
    metadata: { patientId: record.patientId, title: record.title },
  });

  const fail = async (): Promise<OcrResult> => {
    await logInteraction({
      userId: actor.userId,
      feature: "ocr-summary",
      question: recordId,
      wasFallback: true,
    });
    return { extractedText: null, summary: null, fallback: true };
  };
  if (!isAiConfigured()) return fail();

  let image: { mimeType: string; data: string };
  try {
    const url = signDeliveryUrl(record.fileUrl, record.fileType);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch record (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    image = {
      mimeType: record.fileType.toLowerCase() === "png" ? "image/png" : "image/jpeg",
      data: buf.toString("base64"),
    };
  } catch {
    return fail();
  }

  try {
    const result = await generateValidated(getProvider(), {
      feature: "ocr-summary",
      prompt:
        "Transcribe this photographed medical document. Put every readable line into extractedText, preserving structure. Then write a short plain-language summary. Never diagnose.",
      schema: ocrOutputSchema,
      images: [image],
      maxTokens: 2048,
    });

    const usage = getProvider().lastUsage();
    await logInteraction({
      userId: actor.userId,
      feature: "ocr-summary",
      question: recordId,
      responseRef: result.summary,
      latencyMs: usage.latencyMs,
      tokensUsed: usage.tokensUsed,
      wasFallback: false,
    });
    return { extractedText: result.extractedText, summary: result.summary, fallback: false };
  } catch (err) {
    if (!(err instanceof AiGenerationError)) throw err;
    return fail();
  }
}

// ─── Medical report summary (queued) ─────────────────────────────────────────

const reportSummaryOutputSchema = z.object({
  keyValues: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        value: z.string().min(1).max(200),
        referenceRange: z.string().max(200).nullable(),
      }),
    )
    .max(40),
  flags: z.array(z.string().min(1).max(300)).max(20),
  plainLanguageSummary: z.string().min(1).max(2000),
});

/**
 * Runs inside the summaries worker (never in a request). Generates the report
 * summary and writes `MedicalRecord.aiSummary`. Idempotent — a record that already
 * has a summary is skipped, and a failure writes a deterministic `fallback` marker
 * so the queue stops retrying instead of hammering the free tier.
 */
export async function summarizeRecord(recordId: string): Promise<void> {
  const record = await prisma.medicalRecord.findUnique({ where: { id: recordId } });
  if (!record || record.deletedAt) return;
  if (record.aiSummary) return;
  if (!record.extractedText || !record.extractedText.trim()) return;

  const logUser = record.uploadedById ? { userId: record.uploadedById, role: "SYSTEM" } : null;

  // Unconfigured: nothing to generate and nothing to mark — the record simply has
  // no summary, which the UI renders as "unavailable".
  if (!isAiConfigured()) return;

  const markFallback = async () => {
    await prisma.medicalRecord.update({
      where: { id: recordId },
      data: { aiSummary: { fallback: true, generatedAt: new Date().toISOString() } },
    });
    if (logUser) {
      await logInteraction({
        userId: logUser.userId,
        feature: "report-summary",
        question: recordId,
        wasFallback: true,
      });
    }
  };

  const prompt = [
    "Summarise this extracted medical report for the patient.",
    "Extract the key measured values with their reference ranges, flag anything abnormal, and write a plain-language summary.",
    "Never name a condition as a fact. Never contradict what the report itself says.",
    `Report title: ${record.title}`,
    "---",
    stripPII(record.extractedText).slice(0, MAX_SUMMARY_CHARS),
  ].join("\n");

  try {
    const result = await generateValidated(getProvider(), {
      feature: "report-summary",
      prompt,
      schema: reportSummaryOutputSchema,
      maxTokens: 1200,
    });

    await prisma.medicalRecord.update({
      where: { id: recordId },
      data: {
        aiSummary: {
          keyValues: result.keyValues,
          flags: result.flags,
          plainLanguageSummary: result.plainLanguageSummary,
          generatedAt: new Date().toISOString(),
          model: env.JINA_CHAT_MODEL,
        },
      },
    });

    const usage = getProvider().lastUsage();
    if (logUser) {
      await logInteraction({
        userId: logUser.userId,
        feature: "report-summary",
        question: recordId,
        responseRef: result.plainLanguageSummary,
        latencyMs: usage.latencyMs,
        tokensUsed: usage.tokensUsed,
        wasFallback: false,
      });
    }
  } catch (err) {
    if (!(err instanceof AiGenerationError)) throw err;
    await markFallback();
  }
}

/** The stored summary, or null when none exists yet. */
export async function getReportSummary(recordId: string, actor: Actor) {
  const record = await prisma.medicalRecord.findUnique({ where: { id: recordId } });
  if (!record || record.deletedAt) throw new AppError("Record not found", 404);
  await assertClinicalAccess(record.patientId, actor);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "MEDICAL_RECORD_SUMMARY_VIEWED",
    targetType: "medical_record",
    targetId: recordId,
    metadata: { patientId: record.patientId },
  });

  return record.aiSummary;
}

/** Enqueues a (re)summarise job for a record with extractable text. */
export async function enqueueReportSummary(
  recordId: string,
  actor: Actor,
): Promise<{ queued: boolean }> {
  const record = await prisma.medicalRecord.findUnique({ where: { id: recordId } });
  if (!record || record.deletedAt) throw new AppError("Record not found", 404);
  await assertClinicalAccess(record.patientId, actor);
  if (!record.extractedText || !record.extractedText.trim()) {
    throw new AppError("This record has no extractable text to summarise", 400);
  }
  await addSummaryJob(recordId);
  return { queued: true };
}

// ─── Appointment assistant (patient + doctor) ────────────────────────────────

const appointmentOutputSchema = z.object({
  answer: z.string().min(1).max(3000),
});

export interface AppointmentAssistResult {
  answer: string | null;
  factSheet: string;
  fallback: boolean;
}

/**
 * Guided AI answer about a specific appointment.
 *
 * Access: a doctor only for an appointment they treat (or were referred into);
 * everyone else passes the standard clinical gate — a patient for their own
 * appointment (and guardians), admins, and contextual pharmacy/lab roles. The
 * deterministic `factSheet` is always returned and doubles as the non-AI fallback,
 * so an outage never leaves the caller without the appointment's own facts.
 */
export async function explainAppointment(
  appointmentId: string,
  actor: Actor,
  question?: string,
): Promise<AppointmentAssistResult> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      doctor: {
        include: { departments: { include: { department: { select: { name: true } } } } },
      },
      slot: true,
      note: { select: { signedAt: true } },
      prescription: { select: { items: true } },
      labOrders: { take: 5, orderBy: { orderedAt: "desc" } },
    },
  });
  if (!appointment || appointment.deletedAt) throw new AppError("Appointment not found", 404);

  if (actor.role === "DOCTOR") {
    await assertNoteReadAccess(appointmentId, actor);
  } else {
    await assertClinicalAccess(appointment.patientId, actor);
  }

  const department = appointment.doctor.departments[0]?.department?.name ?? null;
  const factSheet = [
    `Appointment ${appointment.appointmentNo}`,
    `Doctor: ${appointment.doctor.fullName}${department ? ` (${department})` : ""}`,
    `Scheduled: ${appointment.slot.startTime.toISOString()} – ${appointment.slot.endTime.toISOString()}`,
    `Status: ${appointment.status}`,
    appointment.reasonNote ? `Reason given: ${appointment.reasonNote}` : "",
    appointment.note?.signedAt
      ? "A signed consultation note exists for this visit."
      : "No signed consultation note yet.",
    appointment.prescription && appointment.prescription.items.length > 0
      ? `A prescription covering ${appointment.prescription.items.length} item(s) was written.`
      : "No prescription on record.",
    appointment.labOrders.length > 0
      ? `${appointment.labOrders.length} lab order(s): ${appointment.labOrders
          .map((o) => o.orderNumber)
          .join(", ")}`
      : "No lab orders linked.",
  ]
    .filter(Boolean)
    .join("\n");

  const fail = async (): Promise<AppointmentAssistResult> => {
    await logInteraction({
      userId: actor.userId,
      feature: "appointment-assist",
      question: `${appointmentId}${question ? ` :: ${question}` : ""}`,
      wasFallback: true,
    });
    return { answer: null, factSheet, fallback: true };
  };
  if (!isAiConfigured()) return fail();

  const prompt = [
    question
      ? "Answer the following question using ONLY the appointment details below."
      : "Give a short, practical guide for this appointment — what to expect, and what to do before and at it.",
    ...(question ? [`Question: "${stripPII(question)}"`] : []),
    `Appointment details:\n${stripPII(factSheet)}`,
    "Never name a condition as a fact. This is an administrative and preparation assistant — do not give medical advice beyond the appointment details.",
  ].join("\n");

  try {
    const result = await generateValidated(getProvider(), {
      feature: "appointment-assist",
      prompt,
      schema: appointmentOutputSchema,
      maxTokens: 1024,
    });

    const usage = getProvider().lastUsage();
    await writeAuditLog({
      actorUserId: actor.userId,
      action: "AI_APPOINTMENT_ASSIST",
      targetType: "appointment",
      targetId: appointmentId,
      metadata: { patientId: appointment.patientId, hasQuestion: Boolean(question) },
    });
    await logInteraction({
      userId: actor.userId,
      feature: "appointment-assist",
      question: appointmentId,
      responseRef: result.answer,
      latencyMs: usage.latencyMs,
      tokensUsed: usage.tokensUsed,
      wasFallback: false,
    });
    return { answer: result.answer, factSheet, fallback: false };
  } catch (err) {
    if (!(err instanceof AiGenerationError)) throw err;
    return fail();
  }
}
