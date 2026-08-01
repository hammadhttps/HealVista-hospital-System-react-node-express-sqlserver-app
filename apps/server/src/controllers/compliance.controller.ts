import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/apiResponse.js";
import * as complianceService from "../services/compliance.service.js";
import type { AuditLogQueryInput, DeletionRequestInput } from "@healvista/shared";

export async function listAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const query = (req.validated ?? req.query) as AuditLogQueryInput;
    sendSuccess(res, await complianceService.listAuditLogs(query));
  } catch (err) {
    next(err);
  }
}

export async function patientActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await complianceService.getPatientActivity(String(req.params.id), {
      userId: req.user!.userId,
      role: req.user!.role,
    });
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function requestExport(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await complianceService.requestExport(req.user!.userId, req.ip), 202);
  } catch (err) {
    next(err);
  }
}

export async function exportStatus(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await complianceService.getExportStatus(req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function requestDeletion(req: Request, res: Response, next: NextFunction) {
  try {
    const { password } = req.validated as DeletionRequestInput;
    sendSuccess(
      res,
      await complianceService.requestDeletion(req.user!.userId, password, req.ip),
      202,
    );
  } catch (err) {
    next(err);
  }
}

export async function cancelDeletion(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await complianceService.cancelDeletion(req.user!.userId, req.ip));
  } catch (err) {
    next(err);
  }
}

export async function deletionStatus(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await complianceService.getDeletionStatus(req.user!.userId));
  } catch (err) {
    next(err);
  }
}
