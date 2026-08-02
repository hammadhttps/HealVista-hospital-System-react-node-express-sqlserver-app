import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { adminCreateUserSchema, userListQuerySchema } from "@healvista/shared";
import * as adminController from "../controllers/admin.controller.js";

const router = Router();

router.get(
  "/",
  authenticate,
  requireRole("ADMIN"),
  validate(userListQuerySchema, "query"),
  adminController.listUsers,
);
router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  validate(adminCreateUserSchema),
  adminController.createUser,
);

export default router;
