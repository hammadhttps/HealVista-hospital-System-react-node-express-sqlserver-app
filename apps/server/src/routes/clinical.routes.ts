import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { aiRateLimit } from "../ai/aiRateLimit.middleware.js";
import * as clinical from "../controllers/clinical.controller.js";
import {
  allergyInputSchema,
  conditionInputSchema,
  vaccinationInputSchema,
  surgeryInputSchema,
  familyHistoryInputSchema,
  lifestyleInputSchema,
  noteInputSchema,
  noteTemplateSchema,
  addendumInputSchema,
  prescriptionCheckSchema,
  createPrescriptionSchema,
  issuePrescriptionSchema,
  favouritePrescriptionSchema,
  referralCreateSchema,
  referralRespondSchema,
  dependentAddSchema,
  dependentUpdateSchema,
} from "@healvista/shared";

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
router.post(
  "/patients/:patientId/allergies",
  authenticate,
  validate(allergyInputSchema),
  clinical.addAllergy,
);
router.patch("/allergies/:id/confirm", authenticate, clinical.confirmAllergy);
router.delete("/allergies/:id", authenticate, clinical.removeAllergy);

router.get("/patients/:patientId/conditions", authenticate, clinical.listConditions);
router.post(
  "/patients/:patientId/conditions",
  authenticate,
  validate(conditionInputSchema),
  clinical.addCondition,
);
router.patch("/conditions/:id/resolve", authenticate, clinical.resolveCondition);
router.delete("/conditions/:id", authenticate, clinical.removeCondition);

router.get("/patients/:patientId/vaccinations", authenticate, clinical.listVaccinations);
router.post(
  "/patients/:patientId/vaccinations",
  authenticate,
  validate(vaccinationInputSchema),
  clinical.addVaccination,
);
router.patch(
  "/vaccinations/:id",
  authenticate,
  validate(vaccinationInputSchema.partial()),
  clinical.updateVaccination,
);
router.delete("/vaccinations/:id", authenticate, clinical.removeVaccination);

router.get("/patients/:patientId/surgeries", authenticate, clinical.listSurgeries);
router.post(
  "/patients/:patientId/surgeries",
  authenticate,
  validate(surgeryInputSchema),
  clinical.addSurgery,
);
router.patch(
  "/surgeries/:id",
  authenticate,
  validate(surgeryInputSchema.partial()),
  clinical.updateSurgery,
);
router.delete("/surgeries/:id", authenticate, clinical.removeSurgery);

router.get("/patients/:patientId/family-history", authenticate, clinical.listFamilyHistory);
router.post(
  "/patients/:patientId/family-history",
  authenticate,
  validate(familyHistoryInputSchema),
  clinical.addFamilyHistory,
);
router.patch(
  "/family-history/:id",
  authenticate,
  validate(familyHistoryInputSchema.partial()),
  clinical.updateFamilyHistory,
);
router.delete("/family-history/:id", authenticate, clinical.removeFamilyHistory);

router.get("/patients/:patientId/lifestyle", authenticate, clinical.getLifestyle);
router.put(
  "/patients/:patientId/lifestyle",
  authenticate,
  validate(lifestyleInputSchema),
  clinical.upsertLifestyle,
);

// ─── Vitals ─────────────────────────────────────────────────────────────────
router.get("/patients/:patientId/vitals", authenticate, clinical.getVitals);
router.get("/patients/:patientId/vitals/latest", authenticate, clinical.getLatestVitals);
router.post("/patients/:patientId/vitals", authenticate, clinical.recordVitals);

// ─── Dependants ─────────────────────────────────────────────────────────────
// PATIENT-only: these act on the caller's own guardian links.
router.get("/dependents", authenticate, requireRole("PATIENT"), clinical.listDependents);
router.get("/guardians", authenticate, requireRole("PATIENT"), clinical.listGuardians);
router.post(
  "/dependents",
  authenticate,
  requireRole("PATIENT"),
  validate(dependentAddSchema),
  clinical.addDependent,
);
router.patch(
  "/dependents/:id",
  authenticate,
  requireRole("PATIENT"),
  validate(dependentUpdateSchema),
  clinical.updateDependent,
);
router.delete("/dependents/:id", authenticate, clinical.removeDependent);

// ─── Prescriptions ──────────────────────────────────────────────────────────
router.post(
  "/prescriptions/check",
  authenticate,
  requireRole("DOCTOR", "ADMIN"),
  validate(prescriptionCheckSchema),
  clinical.checkPrescriptionSafety,
);
router.post(
  "/prescriptions",
  authenticate,
  requireRole("DOCTOR"),
  validate(createPrescriptionSchema),
  clinical.createPrescription,
);
router.post(
  "/prescriptions/:id/issue",
  authenticate,
  requireRole("DOCTOR"),
  validate(issuePrescriptionSchema),
  clinical.issuePrescription,
);
router.get("/prescriptions/:id", authenticate, clinical.getPrescription);
router.get("/prescriptions/:id/pdf", authenticate, clinical.getPrescriptionPdf);
router.get("/patients/:patientId/prescriptions", authenticate, clinical.listPatientPrescriptions);

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
  validate(favouritePrescriptionSchema),
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
router.post("/prescriptions", authenticate, requireRole("DOCTOR"), clinical.createPrescription);
router.post(
  "/prescriptions/:id/issue",
  authenticate,
  requireRole("DOCTOR"),
  clinical.issuePrescription,
);
router.get("/prescriptions/:id", authenticate, clinical.getPrescription);
router.get("/prescriptions/:id/pdf", authenticate, clinical.getPrescriptionPdf);
router.get("/patients/:patientId/prescriptions", authenticate, clinical.listPatientPrescriptions);

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

// ─── Consultation notes ─────────────────────────────────────────────────────
// Writes are treating-doctor-only; that check lives in note.service, which knows
// which doctor owns the appointment. `requireRole('DOCTOR')` here only keeps
// obviously-wrong roles out early.
router.get("/appointments/:appointmentId/note", authenticate, clinical.getNote);
router.get(
  "/appointments/:appointmentId/note/previous",
  authenticate,
  requireRole("DOCTOR", "ADMIN"),
  clinical.getPreviousNote,
);
router.put(
  "/appointments/:appointmentId/note",
  authenticate,
  requireRole("DOCTOR"),
  validate(noteInputSchema),
  clinical.saveNote,
);
router.post(
  "/appointments/:appointmentId/note/sign",
  authenticate,
  requireRole("DOCTOR"),
  clinical.signNote,
);
// AI SOAP draft — returns text, persists nothing. Treating-doctor-only gate lives
// in soapDraft.service. Rate-limited per user like the other interactive AI.
router.post(
  "/appointments/:appointmentId/note/draft",
  authenticate,
  requireRole("DOCTOR"),
  aiRateLimit(5, 60_000),
  clinical.draftNote,
);
router.post(
  "/appointments/:appointmentId/note/addenda",
  authenticate,
  requireRole("DOCTOR"),
  validate(addendumInputSchema),
  clinical.addNoteAddendum,
);
router.get("/patients/:patientId/notes", authenticate, clinical.listPatientNotes);

router.get("/note-templates", authenticate, requireRole("DOCTOR"), clinical.listNoteTemplates);
router.post(
  "/note-templates",
  authenticate,
  requireRole("DOCTOR"),
  validate(noteTemplateSchema),
  clinical.saveNoteTemplate,
);
router.delete(
  "/note-templates/:id",
  authenticate,
  requireRole("DOCTOR"),
  clinical.deleteNoteTemplate,
);

// ─── Referrals ──────────────────────────────────────────────────────────────
// A referral to a doctor also grants that doctor access to the record, so creating
// one is doctor-only and referral.service checks the referrer already has access.
router.post(
  "/referrals",
  authenticate,
  requireRole("DOCTOR"),
  validate(referralCreateSchema),
  clinical.createReferral,
);
router.get(
  "/referrals/incoming",
  authenticate,
  requireRole("DOCTOR"),
  clinical.listIncomingReferrals,
);
router.get(
  "/referrals/outgoing",
  authenticate,
  requireRole("DOCTOR"),
  clinical.listOutgoingReferrals,
);
router.get("/referrals/:id", authenticate, requireRole("DOCTOR"), clinical.getReferral);
router.patch(
  "/referrals/:id/respond",
  authenticate,
  requireRole("DOCTOR"),
  validate(referralRespondSchema),
  clinical.respondToReferral,
);
router.get("/patients/:patientId/referrals", authenticate, clinical.listPatientReferrals);

export default router;
