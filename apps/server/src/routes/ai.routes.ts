import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { aiRateLimit } from "../ai/aiRateLimit.middleware.js";
import { symptomCheckSchema } from "@healvista/shared";
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

export default router;
