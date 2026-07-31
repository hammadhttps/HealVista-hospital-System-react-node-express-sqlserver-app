import { Router } from "express";
import { validate } from "../middlewares/validate.middleware";
import { authenticate } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/rbac.middleware";
import {
  bookAppointmentSchema,
  walkInBookingSchema,
  cancelBookingSchema,
  rescheduleSchema,
  checkInSchema,
  generateSlotsSchema,
} from "@medicore/shared";
import * as appointmentController from "../controllers/appointment.controller";

const router = Router();

router.post(
  "/",
  authenticate,
  requireRole("PATIENT"),
  validate(bookAppointmentSchema),
  appointmentController.book,
);
router.post(
  "/walk-in",
  authenticate,
  requireRole("RECEPTIONIST", "ADMIN"),
  validate(walkInBookingSchema),
  appointmentController.bookWalkIn,
);
router.get("/", authenticate, appointmentController.list);
router.get("/mine", authenticate, requireRole("PATIENT"), appointmentController.listMine);
router.post(
  "/admin/generate-slots",
  authenticate,
  requireRole("ADMIN"),
  validate(generateSlotsSchema),
  appointmentController.generateSlots,
);
router.post("/check-in", authenticate, validate(checkInSchema), appointmentController.checkIn);
router.post(
  "/check-in/scan",
  authenticate,
  requireRole("RECEPTIONIST", "ADMIN"),
  validate(checkInSchema),
  appointmentController.checkInScan,
);
router.get("/:id", authenticate, appointmentController.getById);
router.patch(
  "/:id/cancel",
  authenticate,
  validate(cancelBookingSchema),
  appointmentController.cancel,
);
router.post(
  "/:id/reschedule",
  authenticate,
  validate(rescheduleSchema),
  appointmentController.reschedule,
);
router.patch(
  "/:id/start",
  authenticate,
  requireRole("DOCTOR"),
  appointmentController.startConsultation,
);
router.patch(
  "/:id/complete",
  authenticate,
  requireRole("DOCTOR"),
  appointmentController.completeConsultation,
);
router.get("/:id/receipt", authenticate, appointmentController.getReceipt);

export default router;
