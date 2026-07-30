import { Request, Response, NextFunction } from "express";
import * as settingsService from "../services/settings.service";
import { sendSuccess } from "../utils/apiResponse";

export async function get(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await settingsService.get();
    sendSuccess(res, settings);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await settingsService.update(req.body);
    sendSuccess(res, settings);
  } catch (err) {
    next(err);
  }
}
