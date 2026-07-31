import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  adjustStockSchema,
  dispenseSchema,
  medicinesQuerySchema,
  recallSchema,
} from "@healvista/shared";
import * as pharmacy from "../controllers/pharmacy.controller.js";

/**
 * Pharmacy routes.
 *
 * Unlike the clinical modules, this one is genuinely role-shaped: stock and dispensing
 * belong to the pharmacy as a whole, not to a particular patient relationship. So
 * `requireRole` does the work here, and the service re-checks that the caller has a
 * pharmacist record before it moves any stock.
 */
const router = Router();

const pharmacyStaff = requireRole("PHARMACIST", "ADMIN");

// ─── Stock ──────────────────────────────────────────────────────────────────
router.get(
  "/medicines",
  authenticate,
  pharmacyStaff,
  validate(medicinesQuerySchema, "query"),
  pharmacy.searchMedicines,
);
router.get("/medicines/barcode/:barcode", authenticate, pharmacyStaff, pharmacy.findByBarcode);
router.get("/inventory/low-stock", authenticate, pharmacyStaff, pharmacy.listLowStock);
router.get("/inventory/expiring", authenticate, pharmacyStaff, pharmacy.listExpiring);
router.post(
  "/inventory/adjust",
  authenticate,
  pharmacyStaff,
  validate(adjustStockSchema),
  pharmacy.adjustStock,
);
router.get("/inventory/:medicineId/history", authenticate, pharmacyStaff, pharmacy.getStockHistory);

// ─── Dispensing ─────────────────────────────────────────────────────────────
router.get("/queue", authenticate, requireRole("PHARMACIST"), pharmacy.listDispenseQueue);
router.post(
  "/prescriptions/:prescriptionId/dispense",
  authenticate,
  requireRole("PHARMACIST"),
  validate(dispenseSchema),
  pharmacy.dispense,
);

// ─── Recall ─────────────────────────────────────────────────────────────────
// Preview first: a recall notifies real patients, so the pharmacist sees exactly who
// it will reach before sending it.
router.get(
  "/recalls/preview/:medicineId/:batchNumber",
  authenticate,
  pharmacyStaff,
  pharmacy.previewRecall,
);
router.post(
  "/recalls",
  authenticate,
  requireRole("PHARMACIST"),
  validate(recallSchema),
  pharmacy.recallBatch,
);
router.get("/recalls", authenticate, pharmacyStaff, pharmacy.listRecalls);

export default router;
