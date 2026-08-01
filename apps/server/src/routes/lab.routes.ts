import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  labCancelSchema,
  labOrderCreateSchema,
  labResultsSchema,
  labWorklistQuerySchema,
  retestSchema,
} from "@healvista/shared";
import * as lab from "../controllers/lab.controller.js";

/**
 * Laboratory routes.
 *
 * `requireRole` appears where a whole capability belongs to a role (only lab staff run
 * the worklist; only doctors order tests). Everything patient-scoped is authorised in
 * lab.service via access.service — and result *visibility* is decided there too, since
 * "may see the order" and "may see the values" are different questions.
 */
const router = Router();

// ─── Catalogue ──────────────────────────────────────────────────────────────
router.get("/tests", authenticate, lab.listTests);

// ─── Ordering ───────────────────────────────────────────────────────────────
router.post(
  "/orders",
  authenticate,
  requireRole("DOCTOR"),
  validate(labOrderCreateSchema),
  lab.createOrder,
);
router.post(
  "/orders/:id/cancel",
  authenticate,
  requireRole("DOCTOR", "ADMIN"),
  validate(labCancelSchema),
  lab.cancelOrder,
);
router.post(
  "/orders/:id/retest",
  authenticate,
  requireRole("DOCTOR"),
  validate(retestSchema),
  lab.retestOrder,
);

// ─── Lab worklist ───────────────────────────────────────────────────────────
router.get(
  "/worklist",
  authenticate,
  requireRole("LAB_TECHNICIAN", "ADMIN"),
  validate(labWorklistQuerySchema, "query"),
  lab.listWorklist,
);
router.post("/orders/:id/collect", authenticate, requireRole("LAB_TECHNICIAN"), lab.collectSample);
router.post("/orders/:id/start", authenticate, requireRole("LAB_TECHNICIAN"), lab.startTesting);
router.post(
  "/orders/:id/results",
  authenticate,
  requireRole("LAB_TECHNICIAN"),
  validate(labResultsSchema),
  lab.enterResults,
);
// `canVerify` is checked in the service — being a lab technician is not enough.
router.post("/orders/:id/verify", authenticate, requireRole("LAB_TECHNICIAN"), lab.verifyOrder);

// ─── Reads ──────────────────────────────────────────────────────────────────
router.get("/orders", authenticate, lab.listMyOrders);
router.get("/orders/:id", authenticate, lab.getOrder);
router.get("/patients/:patientId/orders", authenticate, lab.listPatientOrders);

export default router;
