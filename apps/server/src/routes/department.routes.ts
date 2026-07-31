import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { createDepartmentSchema, updateDepartmentSchema } from "@medicore/shared";
import * as departmentController from "../controllers/department.controller.js";

const router = Router();

router.get("/", authenticate, departmentController.list);
router.get("/:id", authenticate, departmentController.getById);
router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  validate(createDepartmentSchema),
  departmentController.create,
);
router.patch(
  "/:id",
  authenticate,
  requireRole("ADMIN"),
  validate(updateDepartmentSchema),
  departmentController.update,
);
router.delete("/:id", authenticate, requireRole("ADMIN"), departmentController.remove);

export default router;
