import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { analyticsRangeSchema } from "@healvista/shared";
import * as analyticsController from "../controllers/analytics.controller.js";

const router = Router();

/** Admin date-range operational analytics. All aggregation in SQL. */
router.get(
  "/overview",
  authenticate,
  requireRole("ADMIN"),
  validate(analyticsRangeSchema, "query"),
  analyticsController.overview,
);

export default router;
