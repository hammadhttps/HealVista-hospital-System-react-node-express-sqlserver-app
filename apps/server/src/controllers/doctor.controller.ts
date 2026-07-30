import { Request, Response, NextFunction } from "express";
import * as doctorService from "../services/doctor.service";
import { sendSuccess } from "../utils/apiResponse";
import { AppError } from "../utils/AppError";

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
