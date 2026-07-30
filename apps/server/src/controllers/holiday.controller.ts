import { Request, Response, NextFunction } from "express";
import * as holidayService from "../services/holiday.service";
import { sendSuccess } from "../utils/apiResponse";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const departmentId = req.query.departmentId as string | undefined;
    const holidays = await holidayService.list(departmentId);
    sendSuccess(res, holidays);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const holiday = await holidayService.create(req.body);
    sendSuccess(res, holiday, 201);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await holidayService.remove(req.params.id as string);
    sendSuccess(res, null, 200, "Holiday deleted");
  } catch (err) {
    next(err);
  }
}
