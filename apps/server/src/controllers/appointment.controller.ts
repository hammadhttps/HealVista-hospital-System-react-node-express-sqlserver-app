import { Request, Response, NextFunction } from "express";
import * as appointmentService from "../services/appointment.service";
import * as slotService from "../services/slot.service";
import * as patientService from "../services/patient.service";
import { sendSuccess, sendPaginated } from "../utils/apiResponse";

export async function book(req: Request, res: Response, next: NextFunction) {
  try {
    const patient = await patientService.getPatientByUserId(req.user!.userId);
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
    const result = await appointmentService.getAppointments(
      {
        doctorId: req.query.doctorId as string,
        status: req.query.status as string,
        fromDate: req.query.fromDate as string,
        toDate: req.query.toDate as string,
        departmentId: req.query.departmentId as string,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
      },
      req.user!,
    );
    sendPaginated(res, result.appointments, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
}

export async function listMine(req: Request, res: Response, next: NextFunction) {
  try {
    const patient = await patientService.getPatientByUserId(req.user!.userId);
    const result = await appointmentService.getAppointments(
      {
        patientId: patient.id,
        status: req.query.status as string,
        fromDate: req.query.fromDate as string,
        toDate: req.query.toDate as string,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
      },
      req.user!,
    );
    sendPaginated(res, result.appointments, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const appointment = await appointmentService.getAppointmentById(
      req.params.id as string,
      req.user!,
    );
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
      req.user!,
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
      req.user!,
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
    // `?format=pdf` streams a printable receipt; the default stays JSON so the
    // existing client call keeps working.
    if (req.query.format === "pdf") {
      const { doc, filename } = await appointmentService.generateAppointmentReceiptPdf(
        req.params.id as string,
        req.user!,
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      doc.pipe(res);
      return;
    }

    const receipt = await appointmentService.getAppointmentReceipt(
      req.params.id as string,
      req.user!,
    );
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
