import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
  cashPaymentSchema,
  createIntentSchema,
  paymentHistorySchema,
  refundSchema,
} from "@healvista/shared";
import * as paymentController from "../controllers/payment.controller.js";

const router = Router();

const CASH_ROLES = ["RECEPTIONIST", "ACCOUNTANT", "ADMIN"] as const;

router.post(
  "/create-intent",
  authenticate,
  validate(createIntentSchema),
  paymentController.createIntent,
);

router.post(
  "/cash",
  authenticate,
  requireRole(...CASH_ROLES),
  validate(cashPaymentSchema),
  paymentController.recordCash,
);

router.get(
  "/history",
  authenticate,
  validate(paymentHistorySchema, "query"),
  paymentController.history,
);

router.get("/:id/receipt", authenticate, paymentController.receipt);

router.post(
  "/:id/refund",
  authenticate,
  requireRole("ACCOUNTANT", "ADMIN"),
  validate(refundSchema),
  paymentController.refund,
);

export default router;
