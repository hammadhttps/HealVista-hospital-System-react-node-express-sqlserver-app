import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  symptomCheckSchema,
  assistantQuerySchema,
  appointmentAssistSchema,
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
 * Rate limiting has been temporarily removed while the RAG pipeline is stabilised
 * (see the git history / roadmap). Re-introduce `aiRateLimit` per user before
 * production traffic — the provider's requests-per-minute cap is a shared resource
 * and one user hammering it can exhaust it for everyone. Queued features (report
 * summaries) live on BullMQ workers, not here.
 *
 * Ownership is enforced in the services, not by role: every `:id` route resolves
 * the caller's relationship to that id before any model call.
 */
const router = Router();

router.post("/symptom-check", authenticate, validate(symptomCheckSchema), ai.checkSymptom);

router.post("/lab/:orderId/explain", authenticate, ai.explainLab);

router.post("/prescriptions/:id/explain", authenticate, ai.explainPrescription);

router.post(
  "/appointments/:appointmentId/follow-up",
  authenticate,
  requireRole("DOCTOR"),
  ai.recommendFollowUp,
);

// Appointment assistant — patients (own appointment) and doctors (appointments they
// treat). The service verifies the relationship; no role guard is needed here.
router.post(
  "/appointments/:appointmentId/assist",
  authenticate,
  validate(appointmentAssistSchema),
  ai.assistAppointment,
);

router.post("/records/:recordId/ocr", authenticate, ai.ocrRecord);

// Reading a stored summary is cheap and needs no rate limit — it is a cache read.
router.get("/records/:recordId/summary", authenticate, ai.getRecordSummary);

router.post("/records/:recordId/summarize", authenticate, ai.summarizeRecord);

// ─── RAG: assistant, timeline, semantic search ─────────────────────────────

router.post("/assistant", authenticate, validate(assistantQuerySchema), ai.assistant);

router.get(
  "/timeline-summary/:patientId",
  authenticate,
  validate(timelineSummaryParamsSchema, "params"),
  ai.timelineSummary,
);

router.post(
  "/search",
  authenticate,
  requireRole("DOCTOR"),
  validate(semanticSearchSchema),
  ai.semanticSearch,
);

router.post(
  "/search-all",
  authenticate,
  requireRole("DOCTOR"),
  validate(semanticSearchAllSchema),
  ai.semanticSearchAll,
);

// ─── Hospital knowledge base ────────────────────────────────────────────────
//
// Read + ask are open to every authenticated user — patients get the general
// Q&A ("what are visiting hours?") on the same surface staff use. Writing is
// ADMIN-only, and the service already hides drafts from non-admins.

router.get("/kb", authenticate, ai.kbList);

router.post("/kb/ask", authenticate, validate(kbAskSchema), ai.kbAsk);

router.get("/kb/:id", authenticate, ai.kbGet);

router.post("/kb", authenticate, requireRole("ADMIN"), validate(kbArticleSchema), ai.kbCreate);

router.put(
  "/kb/:id",
  authenticate,
  requireRole("ADMIN"),
  validate(kbArticleUpdateSchema),
  ai.kbUpdate,
);

router.delete("/kb/:id", authenticate, requireRole("ADMIN"), ai.kbDelete);

// ─── Analytics assistant (ADMIN) ───────────────────────────────────────────

router.post(
  "/analytics",
  authenticate,
  requireRole("ADMIN"),
  validate(analyticsQuerySchema),
  ai.analytics,
);

export default router;
