import { Request, Response, NextFunction } from "express";
import type { ListBillsInput } from "@healvista/shared";
import * as billService from "../services/bill.service.js";
import * as discountService from "../services/discount.service.js";
import * as insuranceService from "../services/insurance.service.js";
import * as patientService from "../services/patient.service.js";
import { sendSuccess, sendPaginated } from "../utils/apiResponse.js";

// ─── Bills ──────────────────────────────────────────────────────────────────

export async function createBill(req: Request, res: Response, next: NextFunction) {
  try {
    const bill = await billService.createBill(req.body, req.user!);
    sendSuccess(res, bill, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateBill(req: Request, res: Response, next: NextFunction) {
  try {
    const bill = await billService.updateBill(req.params.id as string, req.body, req.user!);
    sendSuccess(res, bill);
  } catch (err) {
    next(err);
  }
}

export async function finaliseBill(req: Request, res: Response, next: NextFunction) {
  try {
    const bill = await billService.finaliseBill(req.params.id as string, req.user!);
    sendSuccess(res, bill);
  } catch (err) {
    next(err);
  }
}

export async function voidBill(req: Request, res: Response, next: NextFunction) {
  try {
    const bill = await billService.voidBill(req.params.id as string, req.body.reason, req.user!);
    sendSuccess(res, bill);
  } catch (err) {
    next(err);
  }
}

export async function listBills(req: Request, res: Response, next: NextFunction) {
  try {
    // `req.validated` *is* the parsed data, not `{ query: … }`. Reading
    // `.query` off it always missed, silently fell through to the raw
    // `req.query`, and handed the service a request with no `page`/`limit`
    // defaults — every call to this endpoint was a 500.
    const result = await billService.getBills(req.validated as ListBillsInput, req.user!);
    sendPaginated(res, result.bills, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
}

export async function listMyBills(req: Request, res: Response, next: NextFunction) {
  try {
    const patient = await patientService.getPatientByUserId(req.user!.userId);
    const result = await billService.getBills(
      { ...(req.validated as ListBillsInput), patientId: patient.id },
      req.user!,
    );
    const outstanding = await billService.getOutstandingBalance(patient.id);
    sendSuccess(res, {
      bills: result.bills,
      outstandingBalance: outstanding.toFixed(2),
      meta: { total: result.total, page: result.page, limit: result.limit },
    });
  } catch (err) {
    next(err);
  }
}

export async function getBill(req: Request, res: Response, next: NextFunction) {
  try {
    const bill = await billService.getBillById(req.params.id as string, req.user!);
    sendSuccess(res, bill);
  } catch (err) {
    next(err);
  }
}

export async function getBillPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const { doc, filename } = await billService.generateBillPdf(
      req.params.id as string,
      req.user!,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    doc.pipe(res);
  } catch (err) {
    next(err);
  }
}

// ─── Discounts ──────────────────────────────────────────────────────────────

export async function listDiscounts(req: Request, res: Response, next: NextFunction) {
  try {
    const discounts = await discountService.listDiscounts(req.query.active === "true");
    sendSuccess(res, discounts);
  } catch (err) {
    next(err);
  }
}

export async function createDiscount(req: Request, res: Response, next: NextFunction) {
  try {
    const discount = await discountService.createDiscount(req.body, req.user!);
    sendSuccess(res, discount, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateDiscount(req: Request, res: Response, next: NextFunction) {
  try {
    const discount = await discountService.updateDiscount(
      req.params.id as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, discount);
  } catch (err) {
    next(err);
  }
}

export async function deactivateDiscount(req: Request, res: Response, next: NextFunction) {
  try {
    const discount = await discountService.deactivateDiscount(req.params.id as string, req.user!);
    sendSuccess(res, discount);
  } catch (err) {
    next(err);
  }
}

export async function applyDiscount(req: Request, res: Response, next: NextFunction) {
  try {
    const bill = await discountService.applyDiscountToBill(
      req.params.id as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, bill);
  } catch (err) {
    next(err);
  }
}

export async function removeDiscount(req: Request, res: Response, next: NextFunction) {
  try {
    const bill = await discountService.removeDiscountFromBill(
      req.params.id as string,
      req.user!,
    );
    sendSuccess(res, bill);
  } catch (err) {
    next(err);
  }
}

// ─── Insurance ──────────────────────────────────────────────────────────────

export async function listInsurance(req: Request, res: Response, next: NextFunction) {
  try {
    const policies = await insuranceService.listForPatient(
      req.params.patientId as string,
      req.user!,
    );
    sendSuccess(res, policies);
  } catch (err) {
    next(err);
  }
}

export async function createInsurance(req: Request, res: Response, next: NextFunction) {
  try {
    const policy = await insuranceService.createInsurance(req.body, req.user!);
    sendSuccess(res, policy, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateInsurance(req: Request, res: Response, next: NextFunction) {
  try {
    const policy = await insuranceService.updateInsurance(
      req.params.id as string,
      req.body,
      req.user!,
    );
    sendSuccess(res, policy);
  } catch (err) {
    next(err);
  }
}

export async function deactivateInsurance(req: Request, res: Response, next: NextFunction) {
  try {
    const policy = await insuranceService.deactivateInsurance(req.params.id as string, req.user!);
    sendSuccess(res, policy);
  } catch (err) {
    next(err);
  }
}
