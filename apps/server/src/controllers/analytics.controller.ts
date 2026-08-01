import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/apiResponse.js";
import { getOverview } from "../services/opsAnalytics.service.js";
import { AnalyticsRangeInput } from "@healvista/shared";

export async function overview(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = (req.validated ?? req.query) as AnalyticsRangeInput;
    sendSuccess(res, await getOverview(from, to));
  } catch (err) {
    next(err);
  }
}
