import { Router } from "express";
import { z } from "zod";
import { validate } from "../middlewares/validate.middleware";
import { authenticate } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/rbac.middleware";
import {
  patientRegistrationSchema,
  updatePatientSchema,
  emergencyContactSchema,
} from "@medicore/shared";
import * as patientController from "../controllers/patient.controller";

const router = Router();

router.post(
  "/",
  authenticate,
  requireRole("RECEPTIONIST", "ADMIN"),
  validate(patientRegistrationSchema),
  patientController.register,
);
router.get(
  "/",
  authenticate,
  requireRole("RECEPTIONIST", "DOCTOR", "ADMIN"),
  patientController.list,
);
router.get(
  "/:id",
  authenticate,
  requireRole("RECEPTIONIST", "DOCTOR", "ADMIN"),
  patientController.getById,
);
router.patch(
  "/:id",
  authenticate,
  requireRole("RECEPTIONIST", "DOCTOR", "ADMIN"),
  validate(updatePatientSchema),
  patientController.update,
);
router.post(
  "/:id/emergency-contacts",
  authenticate,
  validate(emergencyContactSchema),
  patientController.createEmergencyContact,
);
router.get("/:id/emergency-contacts", authenticate, patientController.listEmergencyContacts);
router.delete(
  "/:id/emergency-contacts/:contactId",
  authenticate,
  patientController.removeEmergencyContact,
);

router.get(
  "/me/favourites",
  authenticate,
  requireRole("PATIENT"),
  patientController.listFavourites,
);
router.post(
  "/me/favourites",
  authenticate,
  requireRole("PATIENT"),
  validate(z.object({ doctorId: z.string().uuid() })),
  patientController.addFavourite,
);
router.delete(
  "/me/favourites/:doctorId",
  authenticate,
  requireRole("PATIENT"),
  patientController.removeFavourite,
);

export default router;
