import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/apiResponse.js";
import { getDashboard } from "../services/dashboard.service.js";

export async function getRoleDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getDashboard(req.user!.role, req.user!.userId);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}
