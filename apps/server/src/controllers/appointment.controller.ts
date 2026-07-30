import { Request, Response, NextFunction } from "express";
import * as appointmentService from "../services/appointment.service";
import * as slotService from "../services/slot.service";
import { sendSuccess, sendPaginated } from "../utils/apiResponse";
import { AppError } from "../utils/AppError";

export async function book(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const patient = await import("../config/db").then((db) =>
      db.prisma.patient.findUnique({ where: { userId } }),
    );
    if (!patient) throw new AppError("Patient profile not found", 404);

    const appointment = await appointmentService.bookAppointment({
      patientId: patient.id,
      doctorId: req.body.doctorId,
      slotId: req.body.slotId,
      departmentId: req.body.departmentId,
      reasonNote: req.body.reasonNote,
      source: "ONLINE",
    });
    sendSuccess(res, appointment, 201);
  } catch (err) {
    next(err);
  }
}

export async function bookWalkIn(req: Request, res: Response, next: NextFunction) {
  try {
    const appointment = await appointmentService.bookAppointment({
      patientId: req.body.patientId,
      doctorId: req.body.doctorId,
      slotId: req.body.slotId,
      departmentId: req.body.departmentId,
      reasonNote: req.body.reasonNote,
      source: "WALK_IN",
      createdById: req.user!.userId,
    });
    sendSuccess(res, appointment, 201);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await appointmentService.getAppointments({
      doctorId: req.query.doctorId as string,
      status: req.query.status as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      departmentId: req.query.departmentId as string,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    });
    sendPaginated(res, result.appointments, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
}

export async function listMine(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const patient = await import("../config/db").then((db) =>
      db.prisma.patient.findUnique({ where: { userId } }),
    );

    const result = await appointmentService.getAppointments({
      patientId: patient?.id,
      status: req.query.status as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    });
    sendPaginated(res, result.appointments, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const appointment = await appointmentService.getAppointmentById(req.params.id as string);
    sendSuccess(res, appointment);
  } catch (err) {
    next(err);
  }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const appointment = await appointmentService.cancelAppointment(
      req.params.id as string,
      req.body.reason,
      req.user!.userId,
    );
    sendSuccess(res, appointment);
  } catch (err) {
    next(err);
  }
}

export async function reschedule(req: Request, res: Response, next: NextFunction) {
  try {
    const appointment = await appointmentService.rescheduleAppointment(
      req.params.id as string,
      req.body.newSlotId,
      req.body.reason,
      req.user!.userId,
    );
    sendSuccess(res, appointment);
  } catch (err) {
    next(err);
  }
}

export async function checkIn(req: Request, res: Response, next: NextFunction) {
  try {
    const appointment = await appointmentService.checkInAppointment(
      req.body.qrToken,
      req.user!.userId,
    );
    sendSuccess(res, appointment);
  } catch (err) {
    next(err);
  }
}

export async function checkInScan(req: Request, res: Response, next: NextFunction) {
  try {
    const appointment = await appointmentService.checkInAppointment(
      req.body.qrToken,
      req.user!.userId,
    );
    sendSuccess(res, appointment);
  } catch (err) {
    next(err);
  }
}

export async function startConsultation(req: Request, res: Response, next: NextFunction) {
  try {
    const appointment = await appointmentService.startConsultation(
      req.params.id as string,
      req.user!.userId,
    );
    sendSuccess(res, appointment);
  } catch (err) {
    next(err);
  }
}

export async function completeConsultation(req: Request, res: Response, next: NextFunction) {
  try {
    const appointment = await appointmentService.completeConsultation(
      req.params.id as string,
      req.user!.userId,
    );
    sendSuccess(res, appointment);
  } catch (err) {
    next(err);
  }
}

export async function getReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    const receipt = await appointmentService.getAppointmentReceipt(req.params.id as string);
    sendSuccess(res, receipt);
  } catch (err) {
    next(err);
  }
}

export async function generateSlots(req: Request, res: Response, next: NextFunction) {
  try {
    const doctorId = req.body.doctorId;
    if (doctorId) {
      const result = await slotService.generateSlotsForDoctor(doctorId);
      sendSuccess(res, result, 201);
    } else {
      const results = await slotService.generateSlotsForAllDoctors();
      sendSuccess(res, results, 201);
    }
  } catch (err) {
    next(err);
  }
}
