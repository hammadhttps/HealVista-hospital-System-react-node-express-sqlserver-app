import { Request, Response, NextFunction } from "express";
import * as historyService from "../services/history.service.js";
import * as vitalsService from "../services/vitals.service.js";
import * as dependentService from "../services/dependent.service.js";
import * as prescriptionService from "../services/prescription.service.js";
import * as noteService from "../services/note.service.js";
import * as referralService from "../services/referral.service.js";
import * as soapDraftService from "../ai/soapDraft.service.js";
import { sendSuccess } from "../utils/apiResponse.js";

// ─── Medical history ────────────────────────────────────────────────────────

export async function getHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const history = await historyService.getPatientHistory(
      req.params.patientId as string,
      req.user!,
    );
    sendSuccess(res, history);
  } catch (err) {
    next(err);
  }
}

export async function listAllergies(req: Request, res: Response, next: NextFunction) {
  try {
    const allergies = await historyService.listAllergies(req.params.patientId as string, req.user!);
    sendSuccess(res, allergies);
  } catch (err) {
    next(err);
  }
}

export async function addAllergy(req: Request, res: Response, next: NextFunction) {
  try {
    const allergy = await historyService.addAllergy(
      req.params.patientId as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, allergy, 201);
  } catch (err) {
    next(err);
  }
}

export async function confirmAllergy(req: Request, res: Response, next: NextFunction) {
  try {
    const allergy = await historyService.confirmAllergy(req.params.id as string, req.user!);
    sendSuccess(res, allergy);
  } catch (err) {
    next(err);
  }
}

export async function removeAllergy(req: Request, res: Response, next: NextFunction) {
  try {
    await historyService.removeAllergy(req.params.id as string, req.user!);
    sendSuccess(res, { removed: true });
  } catch (err) {
    next(err);
  }
}

export async function listConditions(req: Request, res: Response, next: NextFunction) {
  try {
    const conditions = await historyService.listConditions(
      req.params.patientId as string,
      req.user!,
    );
    sendSuccess(res, conditions);
  } catch (err) {
    next(err);
  }
}

export async function addCondition(req: Request, res: Response, next: NextFunction) {
  try {
    const condition = await historyService.addCondition(
      req.params.patientId as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, condition, 201);
  } catch (err) {
    next(err);
  }
}

export async function resolveCondition(req: Request, res: Response, next: NextFunction) {
  try {
    const condition = await historyService.resolveCondition(req.params.id as string, req.user!);
    sendSuccess(res, condition);
  } catch (err) {
    next(err);
  }
}

export async function removeCondition(req: Request, res: Response, next: NextFunction) {
  try {
    await historyService.deleteCondition(req.params.id as string, req.user!);
    sendSuccess(res, { removed: true });
  } catch (err) {
    next(err);
  }
}

export async function listVaccinations(req: Request, res: Response, next: NextFunction) {
  try {
    const vaccinations = await historyService.listVaccinations(
      req.params.patientId as string,
      req.user!,
    );
    sendSuccess(res, vaccinations);
  } catch (err) {
    next(err);
  }
}

export async function addVaccination(req: Request, res: Response, next: NextFunction) {
  try {
    const vaccination = await historyService.addVaccination(
      req.params.patientId as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, vaccination, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateVaccination(req: Request, res: Response, next: NextFunction) {
  try {
    const vaccination = await historyService.updateVaccination(
      req.params.id as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, vaccination);
  } catch (err) {
    next(err);
  }
}

export async function removeVaccination(req: Request, res: Response, next: NextFunction) {
  try {
    await historyService.deleteVaccination(req.params.id as string, req.user!);
    sendSuccess(res, { removed: true });
  } catch (err) {
    next(err);
  }
}

export async function updateSurgery(req: Request, res: Response, next: NextFunction) {
  try {
    const surgery = await historyService.updateSurgery(
      req.params.id as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, surgery);
  } catch (err) {
    next(err);
  }
}

export async function removeSurgery(req: Request, res: Response, next: NextFunction) {
  try {
    await historyService.deleteSurgery(req.params.id as string, req.user!);
    sendSuccess(res, { removed: true });
  } catch (err) {
    next(err);
  }
}

export async function updateFamilyHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const entry = await historyService.updateFamilyHistory(
      req.params.id as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, entry);
  } catch (err) {
    next(err);
  }
}

export async function removeFamilyHistory(req: Request, res: Response, next: NextFunction) {
  try {
    await historyService.deleteFamilyHistory(req.params.id as string, req.user!);
    sendSuccess(res, { removed: true });
  } catch (err) {
    next(err);
  }
}

export async function listSurgeries(req: Request, res: Response, next: NextFunction) {
  try {
    const surgeries = await historyService.listSurgeries(req.params.patientId as string, req.user!);
    sendSuccess(res, surgeries);
  } catch (err) {
    next(err);
  }
}

export async function addSurgery(req: Request, res: Response, next: NextFunction) {
  try {
    const surgery = await historyService.addSurgery(
      req.params.patientId as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, surgery, 201);
  } catch (err) {
    next(err);
  }
}

export async function listFamilyHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const entries = await historyService.listFamilyHistory(
      req.params.patientId as string,
      req.user!,
    );
    sendSuccess(res, entries);
  } catch (err) {
    next(err);
  }
}

export async function addFamilyHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const entry = await historyService.addFamilyHistory(
      req.params.patientId as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, entry, 201);
  } catch (err) {
    next(err);
  }
}

export async function getLifestyle(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await historyService.getLifestyle(req.params.patientId as string, req.user!);
    sendSuccess(res, profile);
  } catch (err) {
    next(err);
  }
}

export async function upsertLifestyle(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await historyService.upsertLifestyle(
      req.params.patientId as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, profile);
  } catch (err) {
    next(err);
  }
}

// ─── Vitals ─────────────────────────────────────────────────────────────────

export async function recordVitals(req: Request, res: Response, next: NextFunction) {
  try {
    const readings = await vitalsService.recordVitals(
      req.params.patientId as string,
      req.body.readings,
      req.user!,
      req.body.appointmentId,
    );
    sendSuccess(res, readings, 201);
  } catch (err) {
    next(err);
  }
}

export async function getVitals(req: Request, res: Response, next: NextFunction) {
  try {
    const readings = await vitalsService.getVitals(
      req.params.patientId as string,
      {
        type: req.query.type as string,
        from: req.query.from as string,
        to: req.query.to as string,
      },
      req.user!,
    );
    sendSuccess(res, readings);
  } catch (err) {
    next(err);
  }
}

export async function getLatestVitals(req: Request, res: Response, next: NextFunction) {
  try {
    const latest = await vitalsService.getLatestVitals(req.params.patientId as string, req.user!);
    sendSuccess(res, latest);
  } catch (err) {
    next(err);
  }
}

// ─── Dependants ─────────────────────────────────────────────────────────────

export async function listDependents(req: Request, res: Response, next: NextFunction) {
  try {
    const dependents = await dependentService.listDependents(req.user!);
    sendSuccess(res, dependents);
  } catch (err) {
    next(err);
  }
}

export async function listGuardians(req: Request, res: Response, next: NextFunction) {
  try {
    const guardians = await dependentService.listGuardians(req.user!);
    sendSuccess(res, guardians);
  } catch (err) {
    next(err);
  }
}

export async function addDependent(req: Request, res: Response, next: NextFunction) {
  try {
    const link = await dependentService.addDependent(req.body, req.user!);
    sendSuccess(res, link, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateDependent(req: Request, res: Response, next: NextFunction) {
  try {
    const link = await dependentService.updateDependentPermissions(
      req.params.id as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, link);
  } catch (err) {
    next(err);
  }
}

export async function removeDependent(req: Request, res: Response, next: NextFunction) {
  try {
    await dependentService.removeDependent(req.params.id as string, req.user!);
    sendSuccess(res, { removed: true });
  } catch (err) {
    next(err);
  }
}

// ─── Prescriptions ──────────────────────────────────────────────────────────

export async function checkPrescriptionSafety(req: Request, res: Response, next: NextFunction) {
  try {
    const report = await prescriptionService.checkSafety(
      req.body.appointmentId,
      req.body.medicines,
      req.user!,
    );
    sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
}

export async function createPrescription(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await prescriptionService.createPrescription(req.body, req.user!);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function issuePrescription(req: Request, res: Response, next: NextFunction) {
  try {
    const prescription = await prescriptionService.issueDraft(
      req.params.id as string,
      req.body.acknowledgedWarnings ?? [],
      req.user!,
    );
    sendSuccess(res, prescription);
  } catch (err) {
    next(err);
  }
}

export async function getPrescription(req: Request, res: Response, next: NextFunction) {
  try {
    const prescription = await prescriptionService.getPrescription(
      req.params.id as string,
      req.user!,
    );
    sendSuccess(res, prescription);
  } catch (err) {
    next(err);
  }
}

export async function getLatestDraft(req: Request, res: Response, next: NextFunction) {
  try {
    const draft = await prescriptionService.getLatestDraftForAppointment(
      req.params.appointmentId as string,
      req.user!,
    );
    sendSuccess(res, draft);
  } catch (err) {
    next(err);
  }
}

export async function updatePrescription(req: Request, res: Response, next: NextFunction) {
  try {
    const prescription = await prescriptionService.updateDraft(
      req.params.id as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, prescription);
  } catch (err) {
    next(err);
  }
}

export async function listPatientPrescriptions(req: Request, res: Response, next: NextFunction) {
  try {
    const prescriptions = await prescriptionService.listForPatient(
      req.params.patientId as string,
      req.user!,
    );
    sendSuccess(res, prescriptions);
  } catch (err) {
    next(err);
  }
}

export async function getPrescriptionPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const { doc, filename } = await prescriptionService.generatePrescriptionPdf(
      req.params.id as string,
      req.user!,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    doc.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function listFavourites(req: Request, res: Response, next: NextFunction) {
  try {
    const favourites = await prescriptionService.listFavourites(req.user!);
    sendSuccess(res, favourites);
  } catch (err) {
    next(err);
  }
}

export async function saveFavourite(req: Request, res: Response, next: NextFunction) {
  try {
    const favourite = await prescriptionService.saveFavourite(req.body, req.user!);
    sendSuccess(res, favourite, 201);
  } catch (err) {
    next(err);
  }
}

export async function applyFavourite(req: Request, res: Response, next: NextFunction) {
  try {
    const items = await prescriptionService.applyFavourite(req.params.id as string, req.user!);
    sendSuccess(res, items);
  } catch (err) {
    next(err);
  }
}

export async function deleteFavourite(req: Request, res: Response, next: NextFunction) {
  try {
    await prescriptionService.deleteFavourite(req.params.id as string, req.user!);
    sendSuccess(res, { removed: true });
  } catch (err) {
    next(err);
  }
}

// ─── Consultation notes ─────────────────────────────────────────────────────

export async function getNote(req: Request, res: Response, next: NextFunction) {
  try {
    const note = await noteService.getNote(req.params.appointmentId as string, req.user!);
    sendSuccess(res, note);
  } catch (err) {
    next(err);
  }
}

export async function saveNote(req: Request, res: Response, next: NextFunction) {
  try {
    const note = await noteService.upsertNote(
      req.params.appointmentId as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, note);
  } catch (err) {
    next(err);
  }
}

export async function draftNote(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await soapDraftService.generateDraft(
      req.params.appointmentId as string,
      req.user!,
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function signNote(req: Request, res: Response, next: NextFunction) {
  try {
    const note = await noteService.signNote(req.params.appointmentId as string, req.user!);
    sendSuccess(res, note);
  } catch (err) {
    next(err);
  }
}

export async function addNoteAddendum(req: Request, res: Response, next: NextFunction) {
  try {
    const addendum = await noteService.addAddendum(
      req.params.appointmentId as string,
      req.body.content,
      req.user!,
    );
    sendSuccess(res, addendum, 201);
  } catch (err) {
    next(err);
  }
}

export async function getPreviousNote(req: Request, res: Response, next: NextFunction) {
  try {
    const note = await noteService.getPreviousNote(req.params.appointmentId as string, req.user!);
    sendSuccess(res, note);
  } catch (err) {
    next(err);
  }
}

export async function listPatientNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const notes = await noteService.listPatientNotes(req.params.patientId as string, req.user!);
    sendSuccess(res, notes);
  } catch (err) {
    next(err);
  }
}

export async function listNoteTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    const templates = await noteService.listTemplates(req.user!);
    sendSuccess(res, templates);
  } catch (err) {
    next(err);
  }
}

export async function saveNoteTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const template = await noteService.saveTemplate(req.body, req.user!);
    sendSuccess(res, template, 201);
  } catch (err) {
    next(err);
  }
}

export async function deleteNoteTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    await noteService.deleteTemplate(req.params.id as string, req.user!);
    sendSuccess(res, { removed: true });
  } catch (err) {
    next(err);
  }
}

// ─── Referrals ──────────────────────────────────────────────────────────────

export async function createReferral(req: Request, res: Response, next: NextFunction) {
  try {
    const referral = await referralService.createReferral(req.body, req.user!);
    sendSuccess(res, referral, 201);
  } catch (err) {
    next(err);
  }
}

export async function respondToReferral(req: Request, res: Response, next: NextFunction) {
  try {
    const referral = await referralService.respondToReferral(
      req.params.id as string,
      req.body.status,
      req.user!,
    );
    sendSuccess(res, referral);
  } catch (err) {
    next(err);
  }
}

export async function listIncomingReferrals(req: Request, res: Response, next: NextFunction) {
  try {
    const referrals = await referralService.listIncoming(
      req.user!,
      req.query.status as string | undefined,
    );
    sendSuccess(res, referrals);
  } catch (err) {
    next(err);
  }
}

export async function listOutgoingReferrals(req: Request, res: Response, next: NextFunction) {
  try {
    const referrals = await referralService.listOutgoing(req.user!);
    sendSuccess(res, referrals);
  } catch (err) {
    next(err);
  }
}

export async function getReferral(req: Request, res: Response, next: NextFunction) {
  try {
    const referral = await referralService.getReferral(req.params.id as string, req.user!);
    sendSuccess(res, referral);
  } catch (err) {
    next(err);
  }
}

export async function listPatientReferrals(req: Request, res: Response, next: NextFunction) {
  try {
    const referrals = await referralService.listForPatient(
      req.params.patientId as string,
      req.user!,
    );
    sendSuccess(res, referrals);
  } catch (err) {
    next(err);
  }
}
