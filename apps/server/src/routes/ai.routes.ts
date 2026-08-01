import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { aiRateLimit } from "../ai/aiRateLimit.middleware.js";
import {
  symptomCheckSchema,
  assistantQuerySchema,
  timelineSummaryParamsSchema,
  semanticSearchSchema,
  semanticSearchAllSchema,
  kbArticleSchema,
  kbArticleUpdateSchema,
  kbAskSchema,
  analyticsQuerySchema,
} from "@healvista/shared";
import * as ai from "../controllers/ai.controller.js";

/**
 * AI routes (Phase 5).
 *
 * Interactive AI endpoints are rate-limited **per user** — the Gemini free tier's
 * requests-per-minute cap is a shared resource, and one user hammering it can
 * exhaust it for everyone. Queued features (report summaries) live on BullMQ
 * workers, not here.
 *
 * Ownership is enforced in the services, not by role: every `:id` route resolves
 * the caller's relationship to that id before any model call.
 */
const router = Router();

/** Everyone except patients can read the hospital knowledge base. */
const STAFF = ["DOCTOR", "RECEPTIONIST", "PHARMACIST", "LAB_TECHNICIAN", "ACCOUNTANT", "ADMIN"];

router.post(
  "/symptom-check",
  authenticate,
  aiRateLimit(5, 60_000),
  validate(symptomCheckSchema),
  ai.checkSymptom,
);

router.post("/lab/:orderId/explain", authenticate, aiRateLimit(10, 60_000), ai.explainLab);

router.post(
  "/prescriptions/:id/explain",
  authenticate,
  aiRateLimit(10, 60_000),
  ai.explainPrescription,
);

router.post(
  "/appointments/:appointmentId/follow-up",
  authenticate,
  requireRole("DOCTOR"),
  aiRateLimit(10, 60_000),
  ai.recommendFollowUp,
);

router.post("/records/:recordId/ocr", authenticate, aiRateLimit(5, 60_000), ai.ocrRecord);

// Reading a stored summary is cheap and needs no rate limit — it is a cache read.
router.get("/records/:recordId/summary", authenticate, ai.getRecordSummary);

router.post(
  "/records/:recordId/summarize",
  authenticate,
  requireRole("DOCTOR", "ADMIN"),
  ai.summarizeRecord,
);

// ─── RAG: assistant, timeline, semantic search ─────────────────────────────

router.post(
  "/assistant",
  authenticate,
  aiRateLimit(10, 60_000),
  validate(assistantQuerySchema),
  ai.assistant,
);

router.get(
  "/timeline-summary/:patientId",
  authenticate,
  aiRateLimit(10, 60_000),
  validate(timelineSummaryParamsSchema, "params"),
  ai.timelineSummary,
);

router.post(
  "/search",
  authenticate,
  requireRole("DOCTOR"),
  aiRateLimit(10, 60_000),
  validate(semanticSearchSchema),
  ai.semanticSearch,
);

router.post(
  "/search-all",
  authenticate,
  requireRole("DOCTOR"),
  aiRateLimit(10, 60_000),
  validate(semanticSearchAllSchema),
  ai.semanticSearchAll,
);

// ─── Hospital knowledge base ────────────────────────────────────────────────

router.get("/kb", authenticate, requireRole(...STAFF), ai.kbList);

router.post(
  "/kb/ask",
  authenticate,
  requireRole(...STAFF),
  aiRateLimit(10, 60_000),
  validate(kbAskSchema),
  ai.kbAsk,
);

router.get("/kb/:id", authenticate, requireRole(...STAFF), ai.kbGet);

router.post(
  "/kb",
  authenticate,
  requireRole("ADMIN"),
  aiRateLimit(20, 60_000),
  validate(kbArticleSchema),
  ai.kbCreate,
);

router.put(
  "/kb/:id",
  authenticate,
  requireRole("ADMIN"),
  aiRateLimit(20, 60_000),
  validate(kbArticleUpdateSchema),
  ai.kbUpdate,
);

router.delete("/kb/:id", authenticate, requireRole("ADMIN"), aiRateLimit(20, 60_000), ai.kbDelete);

// ─── Analytics assistant (ADMIN) ───────────────────────────────────────────

router.post(
  "/analytics",
  authenticate,
  requireRole("ADMIN"),
  aiRateLimit(5, 60_000),
  validate(analyticsQuerySchema),
  ai.analytics,
);

export default router;
