import { Request, Response, NextFunction } from "express";
import * as queueService from "../services/queue.service.js";
import * as appointmentService from "../services/appointment.service.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { AppError } from "../utils/AppError.js";

export async function issueToken(req: Request, res: Response, next: NextFunction) {
  try {
    const token = await queueService.issueToken({
      doctorId: req.body.doctorId,
      patientId: req.body.patientId,
      appointmentId: req.body.appointmentId,
      date: req.body.date ? new Date(req.body.date) : new Date(),
    });
    sendSuccess(res, token, 201);
  } catch (err) {
    next(err);
  }
}

export async function getQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const tokens = await queueService.getQueueForDoctor(
      req.params.doctorId as string,
      req.query.date ? new Date(req.query.date as string) : undefined,
    );
    sendSuccess(res, tokens);
  } catch (err) {
    next(err);
  }
}

export async function callNext(req: Request, res: Response, next: NextFunction) {
  try {
    const token = await queueService.callNext(
      req.params.doctorId as string,
      req.body.date ? new Date(req.body.date) : undefined,
    );
    sendSuccess(res, token);
  } catch (err) {
    next(err);
  }
}

export async function skip(req: Request, res: Response, next: NextFunction) {
  try {
    const token = await queueService.skipToken(
      req.params.id as string,
      req.params.doctorId as string,
    );
    sendSuccess(res, token);
  } catch (err) {
    next(err);
  }
}

export async function getPosition(req: Request, res: Response, next: NextFunction) {
  try {
    const positions = await queueService.getPatientPosition(
      req.params.doctorId as string,
      req.params.date as string,
    );
    sendSuccess(res, positions);
  } catch (err) {
    next(err);
  }
}

export async function todayAppointments(req: Request, res: Response, next: NextFunction) {
  try {
    const today = new Date().toISOString().split("T")[0];
    // A DOCTOR caller is scoped to their own appointments by the service, so the
    // requested doctorId only applies to front-desk roles.
    const result = await appointmentService.getAppointments(
      {
        doctorId: req.query.doctorId as string,
        fromDate: today,
        toDate: today,
      },
      req.user!,
    );
    sendSuccess(res, result.appointments);
  } catch (err) {
    next(err);
  }
}
