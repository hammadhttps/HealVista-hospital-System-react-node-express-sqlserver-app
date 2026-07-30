import { Router } from "express";
import { validate } from "../middlewares/validate.middleware";
import { authenticate } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/rbac.middleware";
import { doctorUpdateSchema } from "@medicore/shared";
import * as doctorController from "../controllers/doctor.controller";

const router = Router();

router.get("/", authenticate, doctorController.list);
router.get("/:id", authenticate, doctorController.getById);
router.get("/:id/profile", authenticate, doctorController.getProfile);
router.patch(
  "/:id/profile",
  authenticate,
  requireRole("DOCTOR", "ADMIN"),
  validate(doctorUpdateSchema),
  doctorController.updateProfile,
);

export default router;
