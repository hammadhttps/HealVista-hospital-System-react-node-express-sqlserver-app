import { Request, Response, NextFunction } from "express";
import * as recordService from "../services/record.service.js";
import { sendSuccess } from "../utils/apiResponse.js";

export async function createUploadSignature(req: Request, res: Response, next: NextFunction) {
  try {
    const signature = await recordService.createUploadSignature(req.body, req.user!);
    sendSuccess(res, signature);
  } catch (err) {
    next(err);
  }
}

export async function registerRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const record = await recordService.registerRecord(req.body, req.user!);
    sendSuccess(res, record, 201);
  } catch (err) {
    next(err);
  }
}

export async function listRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const records = await recordService.listRecords(
      req.params.patientId as string,
      req.user!,
      req.query.category as string | undefined,
    );
    sendSuccess(res, records);
  } catch (err) {
    next(err);
  }
}

export async function listMyRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const records = await recordService.listMyRecords(
      req.user!,
      req.query.category as string | undefined,
      req.query.patientId as string | undefined,
    );
    sendSuccess(res, records);
  } catch (err) {
    next(err);
  }
}

export async function getRecordUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const url = await recordService.getRecordUrl(req.params.id as string, req.user!);
    sendSuccess(res, url);
  } catch (err) {
    next(err);
  }
}

export async function removeRecord(req: Request, res: Response, next: NextFunction) {
  try {
    await recordService.removeRecord(req.params.id as string, req.user!);
    sendSuccess(res, { removed: true });
  } catch (err) {
    next(err);
  }
}

export async function exportHealthVault(req: Request, res: Response, next: NextFunction) {
  try {
    const { doc, filename } = await recordService.exportHealthVault(
      req.user!,
      req.query.patientId as string | undefined,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);
  } catch (err) {
    next(err);
  }
}
