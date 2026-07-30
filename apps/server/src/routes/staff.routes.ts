import { Router } from "express";
import { validate } from "../middlewares/validate.middleware";
import { authenticate } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/rbac.middleware";
import { staffUpdateSchema } from "@medicore/shared";
import * as staffController from "../controllers/staff.controller";

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
