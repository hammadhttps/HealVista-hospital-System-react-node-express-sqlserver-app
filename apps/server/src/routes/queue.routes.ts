import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/rbac.middleware";
import * as queueController from "../controllers/queue.controller";

const router = Router();

router.post("/token", authenticate, queueController.issueToken);
router.get("/doctor/:doctorId", authenticate, queueController.getQueue);
router.patch(
  "/doctor/:doctorId/call-next",
  authenticate,
  requireRole("DOCTOR"),
  queueController.callNext,
);
router.patch("/:id/skip", authenticate, requireRole("DOCTOR"), queueController.skip);
router.get("/doctor/:doctorId/position/:date", authenticate, queueController.getPosition);
router.get("/today", authenticate, queueController.todayAppointments);

export default router;
