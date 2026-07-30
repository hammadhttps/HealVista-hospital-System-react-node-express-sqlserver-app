import { Request, Response, NextFunction } from "express";
import * as patientService from "../services/patient.service";
import { sendSuccess, sendPaginated } from "../utils/apiResponse";

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const patient = await patientService.registerPatient(req.body, req.user?.userId);
    sendSuccess(res, patient, 201);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const search = req.query.search as string | undefined;
    const result = await patientService.listPatients({ search, page, limit });
    sendPaginated(res, result.data, result.total, page, limit);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const patient = await patientService.getPatientById(req.params.id as string);
    sendSuccess(res, patient);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const patient = await patientService.updatePatient(
      req.params.id as string,
      req.body,
      req.user?.userId,
    );
    sendSuccess(res, patient);
  } catch (err) {
    next(err);
  }
}

export async function createEmergencyContact(req: Request, res: Response, next: NextFunction) {
  try {
    const contact = await patientService.createEmergencyContact(req.params.id as string, req.body);
    sendSuccess(res, contact, 201);
  } catch (err) {
    next(err);
  }
}

export async function listEmergencyContacts(req: Request, res: Response, next: NextFunction) {
  try {
    const contacts = await patientService.listEmergencyContacts(req.params.id as string);
    sendSuccess(res, contacts);
  } catch (err) {
    next(err);
  }
}

export async function removeEmergencyContact(req: Request, res: Response, next: NextFunction) {
  try {
    await patientService.removeEmergencyContact(
      req.params.id as string,
      req.params.contactId as string,
    );
    sendSuccess(res, null, 200, "Emergency contact deleted");
  } catch (err) {
    next(err);
  }
}

export async function addFavourite(req: Request, res: Response, next: NextFunction) {
  try {
    const patient = await patientService.getPatientByUserId(req.user!.userId);
    const fav = await patientService.addFavouriteDoctor(patient.id, req.body.doctorId);
    sendSuccess(res, fav, 201);
  } catch (err) {
    next(err);
  }
}

export async function removeFavourite(req: Request, res: Response, next: NextFunction) {
  try {
    const patient = await patientService.getPatientByUserId(req.user!.userId);
    await patientService.removeFavouriteDoctor(patient.id, req.params.doctorId as string);
    sendSuccess(res, null, 204);
  } catch (err) {
    next(err);
  }
}

export async function listFavourites(req: Request, res: Response, next: NextFunction) {
  try {
    const patient = await patientService.getPatientByUserId(req.user!.userId);
    const favs = await patientService.listFavouriteDoctors(patient.id);
    sendSuccess(res, favs);
  } catch (err) {
    next(err);
  }
}
