import { Router } from "express";
import { validate } from "../middlewares/validate.middleware";
import { authenticate } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/rbac.middleware";
import { createDepartmentSchema, updateDepartmentSchema } from "@medicore/shared";
import * as departmentController from "../controllers/department.controller";

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
