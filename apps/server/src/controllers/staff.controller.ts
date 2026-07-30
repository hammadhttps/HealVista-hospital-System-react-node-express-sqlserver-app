import { Request, Response, NextFunction } from "express";
import * as staffService from "../services/staff.service";
import { sendSuccess } from "../utils/apiResponse";

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    const staff = await staffService.list();
    sendSuccess(res, staff);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await staffService.update(
      req.params.userId as string,
      req.body,
      req.user?.userId,
    );
    sendSuccess(res, profile);
  } catch (err) {
    next(err);
  }
}
