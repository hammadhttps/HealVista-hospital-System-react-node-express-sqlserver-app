import { Request, Response, NextFunction } from "express";
import * as departmentService from "../services/department.service.js";
import { sendSuccess } from "../utils/apiResponse.js";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = req.query.slug as string | undefined;
    const departments = await departmentService.list(slug);
    sendSuccess(res, departments);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const department = await departmentService.getById(req.params.id as string);
    sendSuccess(res, department);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const department = await departmentService.create(req.body);
    sendSuccess(res, department, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const department = await departmentService.update(
      req.params.id as string,
      req.body,
    );
    sendSuccess(res, department);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await departmentService.remove(req.params.id as string);
    sendSuccess(res, null, 200, "Department deleted");
  } catch (err) {
    next(err);
  }
}
