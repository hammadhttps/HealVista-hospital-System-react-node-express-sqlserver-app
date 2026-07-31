import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
  applyDiscountSchema,
  createBillSchema,
  createDiscountSchema,
  createInsuranceSchema,
  listBillsSchema,
  updateBillSchema,
  updateDiscountSchema,
  updateInsuranceSchema,
} from "@medicore/shared";
import * as billingController from "../controllers/billing.controller.js";

const router = Router();

/** Staff who may create and edit bills. */
const BILLING_STAFF = ["ACCOUNTANT", "RECEPTIONIST", "ADMIN"] as const;

// ─── Bills ──────────────────────────────────────────────────────────────────
// `/mine` must precede `/:id`, or "mine" is parsed as a bill id.
router.get("/mine", authenticate, requireRole("PATIENT"), billingController.listMyBills);
router.get(
  "/",
  authenticate,
  requireRole(...BILLING_STAFF),
  validate(listBillsSchema, "query"),
  billingController.listBills,
);
router.post(
  "/",
  authenticate,
  requireRole(...BILLING_STAFF),
  validate(createBillSchema),
  billingController.createBill,
);
router.get("/:id", authenticate, billingController.getBill);
router.get("/:id/pdf", authenticate, billingController.getBillPdf);
router.patch(
  "/:id",
  authenticate,
  requireRole(...BILLING_STAFF),
  validate(updateBillSchema),
  billingController.updateBill,
);
router.post(
  "/:id/finalise",
  authenticate,
  requireRole(...BILLING_STAFF),
  billingController.finaliseBill,
);
router.post("/:id/void", authenticate, requireRole("ADMIN"), billingController.voidBill);

// ─── Discount application (on a bill) ───────────────────────────────────────
router.post(
  "/:id/discount",
  authenticate,
  requireRole(...BILLING_STAFF),
  validate(applyDiscountSchema),
  billingController.applyDiscount,
);
router.delete(
  "/:id/discount",
  authenticate,
  requireRole(...BILLING_STAFF),
  billingController.removeDiscount,
);

export default router;

// ─── Discount catalogue (admin) ─────────────────────────────────────────────
export const discountRouter = Router();

discountRouter.get("/", authenticate, billingController.listDiscounts);
discountRouter.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  validate(createDiscountSchema),
  billingController.createDiscount,
);
discountRouter.patch(
  "/:id",
  authenticate,
  requireRole("ADMIN"),
  validate(updateDiscountSchema),
  billingController.updateDiscount,
);
discountRouter.delete(
  "/:id",
  authenticate,
  requireRole("ADMIN"),
  billingController.deactivateDiscount,
);

// ─── Insurance ──────────────────────────────────────────────────────────────
export const insuranceRouter = Router();

insuranceRouter.get("/patient/:patientId", authenticate, billingController.listInsurance);
insuranceRouter.post(
  "/",
  authenticate,
  requireRole(...BILLING_STAFF),
  validate(createInsuranceSchema),
  billingController.createInsurance,
);
insuranceRouter.patch(
  "/:id",
  authenticate,
  requireRole(...BILLING_STAFF),
  validate(updateInsuranceSchema),
  billingController.updateInsurance,
);
insuranceRouter.delete(
  "/:id",
  authenticate,
  requireRole(...BILLING_STAFF),
  billingController.deactivateInsurance,
);
