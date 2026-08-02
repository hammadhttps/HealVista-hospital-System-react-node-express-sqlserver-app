import { Request, Response, NextFunction } from "express";
import * as adminService from "../services/admin.service.js";
import { sendPaginated, sendSuccess } from "../utils/apiResponse.js";

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { users, total } = await adminService.listUsers(req.validated);
    sendPaginated(res, users, total, req.validated.page, req.validated.limit);
  } catch (err) {
    next(err);
  }
}

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await adminService.createUser(req.validated, req.user?.userId);
    sendSuccess(res, user, 201, "User created");
  } catch (err) {
    next(err);
  }
}
