import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import * as clinical from "../controllers/clinical.controller.js";

/**
 * Clinical routes.
 *
 * Note how little role-gating there is here compared with earlier phases: for
 * patient data, `requireRole` is the wrong tool. "Is a doctor" does not imply "is
 * this patient's doctor". Authorisation lives in access.service, which every one of
 * these services calls, and which understands guardians, treating doctors, and
 * referrals. `requireRole` appears only where a whole capability belongs to one role.
 */
const router = Router();

// ─── Medical history ────────────────────────────────────────────────────────
router.get("/patients/:patientId/history", authenticate, clinical.getHistory);

router.get("/patients/:patientId/allergies", authenticate, clinical.listAllergies);
router.post("/patients/:patientId/allergies", authenticate, clinical.addAllergy);
router.patch("/allergies/:id/confirm", authenticate, clinical.confirmAllergy);
router.delete("/allergies/:id", authenticate, clinical.removeAllergy);

router.get("/patients/:patientId/conditions", authenticate, clinical.listConditions);
router.post("/patients/:patientId/conditions", authenticate, clinical.addCondition);
router.patch("/conditions/:id/resolve", authenticate, clinical.resolveCondition);

router.get("/patients/:patientId/vaccinations", authenticate, clinical.listVaccinations);
router.post("/patients/:patientId/vaccinations", authenticate, clinical.addVaccination);

router.get("/patients/:patientId/surgeries", authenticate, clinical.listSurgeries);
router.post("/patients/:patientId/surgeries", authenticate, clinical.addSurgery);

router.get("/patients/:patientId/family-history", authenticate, clinical.listFamilyHistory);
router.post("/patients/:patientId/family-history", authenticate, clinical.addFamilyHistory);

router.get("/patients/:patientId/lifestyle", authenticate, clinical.getLifestyle);
router.put("/patients/:patientId/lifestyle", authenticate, clinical.upsertLifestyle);

// ─── Vitals ─────────────────────────────────────────────────────────────────
router.get("/patients/:patientId/vitals", authenticate, clinical.getVitals);
router.get("/patients/:patientId/vitals/latest", authenticate, clinical.getLatestVitals);
router.post("/patients/:patientId/vitals", authenticate, clinical.recordVitals);

// ─── Dependants ─────────────────────────────────────────────────────────────
// PATIENT-only: these act on the caller's own guardian links.
router.get("/dependents", authenticate, requireRole("PATIENT"), clinical.listDependents);
router.get("/guardians", authenticate, requireRole("PATIENT"), clinical.listGuardians);
router.post("/dependents", authenticate, requireRole("PATIENT"), clinical.addDependent);
router.patch("/dependents/:id", authenticate, requireRole("PATIENT"), clinical.updateDependent);
router.delete("/dependents/:id", authenticate, clinical.removeDependent);

// ─── Prescriptions ──────────────────────────────────────────────────────────
router.post(
  "/prescriptions/check",
  authenticate,
  requireRole("DOCTOR", "ADMIN"),
  clinical.checkPrescriptionSafety,
);
router.post(
  "/prescriptions",
  authenticate,
  requireRole("DOCTOR"),
  clinical.createPrescription,
);
router.post(
  "/prescriptions/:id/issue",
  authenticate,
  requireRole("DOCTOR"),
  clinical.issuePrescription,
);
router.get("/prescriptions/:id", authenticate, clinical.getPrescription);
router.get("/prescriptions/:id/pdf", authenticate, clinical.getPrescriptionPdf);
router.get(
  "/patients/:patientId/prescriptions",
  authenticate,
  clinical.listPatientPrescriptions,
);

// Favourites are per-doctor.
router.get(
  "/prescription-favourites",
  authenticate,
  requireRole("DOCTOR"),
  clinical.listFavourites,
);
router.post(
  "/prescription-favourites",
  authenticate,
  requireRole("DOCTOR"),
  clinical.saveFavourite,
);
router.post(
  "/prescription-favourites/:id/apply",
  authenticate,
  requireRole("DOCTOR"),
  clinical.applyFavourite,
);
router.delete(
  "/prescription-favourites/:id",
  authenticate,
  requireRole("DOCTOR"),
  clinical.deleteFavourite,
);

export default router;
