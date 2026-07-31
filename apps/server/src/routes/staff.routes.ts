import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { staffUpdateSchema } from "@healvista/shared";
import * as staffController from "../controllers/staff.controller.js";

const router = Router();

router.get("/", authenticate, requireRole("ADMIN"), staffController.list);
router.patch(
  "/:userId",
  authenticate,
  requireRole("ADMIN"),
  validate(staffUpdateSchema),
  staffController.update,
);

export default router;
