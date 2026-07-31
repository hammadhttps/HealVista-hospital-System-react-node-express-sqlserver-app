import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import * as holidayController from "../controllers/holiday.controller.js";

const router = Router();

router.get("/", authenticate, holidayController.list);
router.post("/", authenticate, requireRole("ADMIN"), holidayController.create);
router.delete(
  "/:id",
  authenticate,
  requireRole("ADMIN"),
  holidayController.remove,
);

export default router;
