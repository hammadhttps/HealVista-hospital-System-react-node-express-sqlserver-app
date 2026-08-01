import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/apiResponse.js";
import * as symptomService from "../ai/symptom.service.js";
import * as directPrompts from "../ai/directPrompts.service.js";

// ─── Symptom checker ────────────────────────────────────────────────────────

export async function checkSymptom(req: Request, res: Response, next: NextFunction) {
  try {
    const { message } = req.validated as { message: string };
    const result = await symptomService.checkSymptom(message, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// ─── Direct-prompt explainers ───────────────────────────────────────────────

export async function explainLab(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await directPrompts.explainLabReport(req.params.orderId as string, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function explainPrescription(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await directPrompts.explainPrescription(req.params.id as string, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function recommendFollowUp(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await directPrompts.recommendFollowUp(
      req.params.appointmentId as string,
      req.user!,
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// ─── OCR & report summaries ─────────────────────────────────────────────────

export async function ocrRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await directPrompts.ocrRecord(req.params.recordId as string, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getRecordSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await directPrompts.getReportSummary(req.params.recordId as string, req.user!);
    sendSuccess(res, summary);
  } catch (err) {
    next(err);
  }
}

export async function summarizeRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await directPrompts.enqueueReportSummary(
      req.params.recordId as string,
      req.user!,
    );
    sendSuccess(res, result, 202);
  } catch (err) {
    next(err);
  }
}
