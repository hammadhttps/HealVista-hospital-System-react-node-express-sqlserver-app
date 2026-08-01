import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/apiResponse.js";
import * as symptomService from "../ai/symptom.service.js";
import * as directPrompts from "../ai/directPrompts.service.js";
import * as ragService from "../ai/rag.service.js";
import * as kbService from "../ai/kb.service.js";
import * as analyticsService from "../ai/analytics.service.js";
import {
  AssistantQueryInput,
  TimelineSummaryParams,
  SemanticSearchInput,
  SemanticSearchAllInput,
  KbArticleInput,
  KbArticleUpdateInput,
  KbAskInput,
  AnalyticsQueryInput,
} from "@healvista/shared";

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

// ─── RAG assistant, timeline & semantic search ─────────────────────────────

export async function assistant(req: Request, res: Response, next: NextFunction) {
  try {
    const { question, patientId } = req.validated as AssistantQueryInput;
    const result = await ragService.assistant(question, req.user!, patientId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function timelineSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const { patientId } = req.validated as TimelineSummaryParams;
    const result = await ragService.timelineSummary(patientId, req.user!);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function semanticSearch(req: Request, res: Response, next: NextFunction) {
  try {
    const { query, patientId, k } = req.validated as SemanticSearchInput;
    const result = await ragService.semanticSearch(query, patientId, req.user!, k);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function semanticSearchAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { query, k } = req.validated as SemanticSearchAllInput;
    const result = await ragService.semanticSearchAll(query, req.user!, k);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// ─── Hospital knowledge base ───────────────────────────────────────────────

export async function kbList(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await kbService.listKbArticles(req.user!));
  } catch (err) {
    next(err);
  }
}

export async function kbGet(req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, await kbService.getKbArticle(req.params.id as string, req.user!));
  } catch (err) {
    next(err);
  }
}

export async function kbCreate(req: Request, res: Response, next: NextFunction) {
  try {
    const article = await kbService.createKbArticle(req.validated as KbArticleInput, req.user!);
    sendSuccess(res, article, 201);
  } catch (err) {
    next(err);
  }
}

export async function kbUpdate(req: Request, res: Response, next: NextFunction) {
  try {
    const article = await kbService.updateKbArticle(
      req.params.id as string,
      req.validated as KbArticleUpdateInput,
      req.user!,
    );
    sendSuccess(res, article);
  } catch (err) {
    next(err);
  }
}

export async function kbDelete(req: Request, res: Response, next: NextFunction) {
  try {
    await kbService.deleteKbArticle(req.params.id as string, req.user!);
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

export async function kbAsk(req: Request, res: Response, next: NextFunction) {
  try {
    const { question } = req.validated as KbAskInput;
    sendSuccess(res, await kbService.askKb(question, req.user!));
  } catch (err) {
    next(err);
  }
}

// ─── Analytics assistant ───────────────────────────────────────────────────

export async function analytics(req: Request, res: Response, next: NextFunction) {
  try {
    const { question } = req.validated as AnalyticsQueryInput;
    sendSuccess(res, await analyticsService.runAnalyticsQuestion(question, req.user!));
  } catch (err) {
    next(err);
  }
}
