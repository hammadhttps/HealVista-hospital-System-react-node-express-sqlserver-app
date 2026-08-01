import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { auditLogQuerySchema, deletionRequestSchema } from "@healvista/shared";
import * as complianceController from "../controllers/compliance.controller.js";

/**
 * Audit & compliance (Phase 6.4).
 *
 * Note what is absent: there is no PATCH or DELETE for an audit log. Audit rows
 * are append-only, enforced by a database trigger as well as by the lack of a
 * route.
 */

export const adminComplianceRouter = Router();

adminComplianceRouter.get(
  "/audit-logs",
  authenticate,
  requireRole("ADMIN"),
  validate(auditLogQuerySchema, "query"),
  complianceController.listAuditLogs,
);

/** Who accessed this patient's record. Readable by the patient and by an admin. */
adminComplianceRouter.get(
  "/patients/:id/activity",
  authenticate,
  complianceController.patientActivity,
);

export const meComplianceRouter = Router();

meComplianceRouter.post("/export", authenticate, complianceController.requestExport);
meComplianceRouter.get("/export", authenticate, complianceController.exportStatus);

meComplianceRouter.post(
  "/delete",
  authenticate,
  validate(deletionRequestSchema),
  complianceController.requestDeletion,
);
meComplianceRouter.delete("/delete", authenticate, complianceController.cancelDeletion);
meComplianceRouter.get("/delete", authenticate, complianceController.deletionStatus);
