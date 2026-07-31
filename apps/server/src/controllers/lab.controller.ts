import { Request, Response, NextFunction } from "express";
import * as labService from "../services/lab.service.js";
import { sendSuccess } from "../utils/apiResponse.js";

export async function listTests(req: Request, res: Response, next: NextFunction) {
  try {
    const tests = await labService.listTests({
      category: req.query.category as string,
      search: req.query.search as string,
    });
    sendSuccess(res, tests);
  } catch (err) {
    next(err);
  }
}

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await labService.createOrder(req.body, req.user!);
    sendSuccess(res, order, 201);
  } catch (err) {
    next(err);
  }
}

export async function cancelOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await labService.cancelOrder(
      req.params.id as string,
      req.body.reason,
      req.user!,
    );
    sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
}

export async function collectSample(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await labService.collectSample(req.params.id as string, req.user!);
    sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
}

export async function startTesting(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await labService.startTesting(req.params.id as string, req.user!);
    sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
}

export async function enterResults(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await labService.enterResults(
      req.params.id as string,
      req.body.results,
      req.user!,
    );
    sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
}

export async function verifyOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await labService.verifyOrder(req.params.id as string, req.user!);
    sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
}

export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await labService.getOrder(req.params.id as string, req.user!);
    sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
}

export async function listPatientOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const orders = await labService.listPatientOrders(
      req.params.patientId as string,
      req.user!,
    );
    sendSuccess(res, orders);
  } catch (err) {
    next(err);
  }
}

export async function listWorklist(req: Request, res: Response, next: NextFunction) {
  try {
    const orders = await labService.listWorklist(
      req.user!,
      req.query.status as labService.LabStatus | undefined,
    );
    sendSuccess(res, orders);
  } catch (err) {
    next(err);
  }
}

export async function listMyOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const orders = await labService.listMyOrders(req.user!);
    sendSuccess(res, orders);
  } catch (err) {
    next(err);
  }
}
