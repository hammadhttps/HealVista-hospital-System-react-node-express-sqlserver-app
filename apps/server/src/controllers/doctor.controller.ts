import { Request, Response, NextFunction } from "express";
import * as doctorService from "../services/doctor.service.js";
import { sendSuccess, sendPaginated } from "../utils/apiResponse.js";
import { AppError } from "../utils/AppError.js";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const search = req.query.search as string | undefined;
    const doctors = await doctorService.list(search);
    sendSuccess(res, doctors);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const doctor = await doctorService.getDoctorById(req.params.id as string);
    sendSuccess(res, doctor);
  } catch (err) {
    next(err);
  }
}

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const doctor = await doctorService.getProfileByUserId(req.params.id as string);
    sendSuccess(res, doctor);
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const targetUserId = req.params.id as string;
    if (targetUserId !== req.user!.userId && req.user!.role !== "ADMIN") {
      throw new AppError("You can only update your own profile", 403);
    }
    const doctor = await doctorService.updateProfile(targetUserId, req.validated);
    sendSuccess(res, doctor);
  } catch (err) {
    next(err);
  }
}

export async function getAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const availability = await doctorService.getAvailability(req.params.id as string);
    sendSuccess(res, availability);
  } catch (err) {
    next(err);
  }
}

export async function updateAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const doctorId = req.params.id as string;
    const doctor = await doctorService.getDoctorById(doctorId);
    const profileUserId = doctor.userId;
    if (profileUserId !== req.user!.userId && req.user!.role !== "ADMIN") {
      throw new AppError("You can only update your own availability", 403);
    }
    const availability = await doctorService.upsertAvailability(
      doctorId,
      req.validated.entries ?? [req.validated],
    );
    sendSuccess(res, availability);
  } catch (err) {
    next(err);
  }
}

export async function listExceptions(req: Request, res: Response, next: NextFunction) {
  try {
    const exceptions = await doctorService.getExceptions(req.params.id as string);
    sendSuccess(res, exceptions);
  } catch (err) {
    next(err);
  }
}

export async function createException(req: Request, res: Response, next: NextFunction) {
  try {
    const doctorId = req.params.id as string;
    const doctor = await doctorService.getDoctorById(doctorId);
    const profileUserId = doctor.userId;
    if (profileUserId !== req.user!.userId && req.user!.role !== "ADMIN") {
      throw new AppError("You can only manage your own exceptions", 403);
    }
    const result = await doctorService.createException(doctorId, req.validated);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function deleteException(req: Request, res: Response, next: NextFunction) {
  try {
    await doctorService.deleteException(req.params.id as string, req.params.exceptionId as string);
    sendSuccess(res, null, 204);
  } catch (err) {
    next(err);
  }
}

export async function searchDoctors(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await doctorService.listDoctors({
      departmentId: req.query.departmentId as string,
      minFee: req.query.minFee ? Number(req.query.minFee) : undefined,
      maxFee: req.query.maxFee ? Number(req.query.maxFee) : undefined,
      search: req.query.search as string,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    });
    sendPaginated(res, result.doctors, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
}

export async function getDoctorWithSlots(req: Request, res: Response, next: NextFunction) {
  try {
    const doctor = await doctorService.getDoctorWithSlots(req.params.id as string);
    sendSuccess(res, doctor);
  } catch (err) {
    next(err);
  }
}

export async function getSlotsForDate(req: Request, res: Response, next: NextFunction) {
  try {
    const slots = await doctorService.getSlotsForDate(
      req.params.id as string,
      req.params.date as string,
    );
    sendSuccess(res, slots);
  } catch (err) {
    next(err);
  }
}

export async function matchDoctors(req: Request, res: Response, next: NextFunction) {
  try {
    const { symptom } = req.validated as { symptom: string };
    const result = await doctorService.matchDoctorsBySymptom(symptom);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
