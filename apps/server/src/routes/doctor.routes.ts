import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { authenticate, optionalAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
  doctorUpdateSchema,
  doctorAvailabilitySchema,
  doctorAvailabilityArraySchema,
  availabilityExceptionSchema,
  symptomMatchSchema,
} from "@healvista/shared";
import * as doctorController from "../controllers/doctor.controller.js";

const router = Router();

router.get("/", optionalAuth, doctorController.searchDoctors);
router.post("/match", authenticate, validate(symptomMatchSchema), doctorController.matchDoctors);
router.get("/:id", optionalAuth, doctorController.getDoctorWithSlots);
router.get("/:id/profile", authenticate, doctorController.getProfile);
router.patch(
  "/:id/profile",
  authenticate,
  requireRole("DOCTOR", "ADMIN"),
  validate(doctorUpdateSchema),
  doctorController.updateProfile,
);

router.get("/:id/availability", authenticate, doctorController.getAvailability);
router.put(
  "/:id/availability",
  authenticate,
  requireRole("DOCTOR", "ADMIN"),
  validate(doctorAvailabilityArraySchema),
  doctorController.updateAvailability,
);

router.get("/:id/exceptions", authenticate, doctorController.listExceptions);
router.post(
  "/:id/exceptions",
  authenticate,
  requireRole("DOCTOR", "ADMIN"),
  validate(availabilityExceptionSchema),
  doctorController.createException,
);
router.delete(
  "/:id/exceptions/:exceptionId",
  authenticate,
  requireRole("DOCTOR", "ADMIN"),
  doctorController.deleteException,
);

router.get("/:id/slots/:date", authenticate, doctorController.getSlotsForDate);

export default router;
