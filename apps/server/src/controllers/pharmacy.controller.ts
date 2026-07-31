import { Request, Response, NextFunction } from "express";
import * as pharmacyService from "../services/pharmacy.service.js";
import { sendSuccess } from "../utils/apiResponse.js";

export async function searchMedicines(req: Request, res: Response, next: NextFunction) {
  try {
    const medicines = await pharmacyService.searchMedicines({
      search: req.query.search as string,
      lowStockOnly: req.query.lowStockOnly === "true",
    });
    sendSuccess(res, medicines);
  } catch (err) {
    next(err);
  }
}

export async function findByBarcode(req: Request, res: Response, next: NextFunction) {
  try {
    const medicine = await pharmacyService.findByBarcode(req.params.barcode as string);
    sendSuccess(res, medicine);
  } catch (err) {
    next(err);
  }
}

export async function listLowStock(_req: Request, res: Response, next: NextFunction) {
  try {
    const items = await pharmacyService.listLowStock();
    sendSuccess(res, items);
  } catch (err) {
    next(err);
  }
}

export async function listExpiring(req: Request, res: Response, next: NextFunction) {
  try {
    const items = await pharmacyService.listExpiring(
      req.query.days ? Number(req.query.days) : undefined,
    );
    sendSuccess(res, items);
  } catch (err) {
    next(err);
  }
}

export async function adjustStock(req: Request, res: Response, next: NextFunction) {
  try {
    const inventory = await pharmacyService.adjustStock(req.body, req.user!);
    sendSuccess(res, inventory);
  } catch (err) {
    next(err);
  }
}

export async function getStockHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const history = await pharmacyService.getStockHistory(req.params.medicineId as string);
    sendSuccess(res, history);
  } catch (err) {
    next(err);
  }
}

export async function dispense(req: Request, res: Response, next: NextFunction) {
  try {
    const prescription = await pharmacyService.dispense(
      req.params.prescriptionId as string,
      req.body.lines,
      req.user!,
    );
    sendSuccess(res, prescription);
  } catch (err) {
    next(err);
  }
}

export async function listDispenseQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const queue = await pharmacyService.listDispenseQueue(req.user!);
    sendSuccess(res, queue);
  } catch (err) {
    next(err);
  }
}

export async function previewRecall(req: Request, res: Response, next: NextFunction) {
  try {
    const patients = await pharmacyService.findPatientsForBatch(
      req.params.medicineId as string,
      req.params.batchNumber as string,
    );
    sendSuccess(res, { patientsAffected: patients.length, patients });
  } catch (err) {
    next(err);
  }
}

export async function recallBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await pharmacyService.recallBatch(req.body, req.user!);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function listRecalls(_req: Request, res: Response, next: NextFunction) {
  try {
    const recalls = await pharmacyService.listRecalls();
    sendSuccess(res, recalls);
  } catch (err) {
    next(err);
  }
}
