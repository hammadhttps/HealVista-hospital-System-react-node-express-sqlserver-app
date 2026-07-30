import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/rbac.middleware";
import * as holidayController from "../controllers/holiday.controller";

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
