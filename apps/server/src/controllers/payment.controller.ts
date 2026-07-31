import { Request, Response, NextFunction } from "express";
import * as paymentService from "../services/payment.service.js";
import { sendSuccess, sendPaginated } from "../utils/apiResponse.js";
import { AppError } from "../utils/AppError.js";

export async function createIntent(req: Request, res: Response, next: NextFunction) {
  try {
    const intent = await paymentService.createIntent(req.body, req.user!);
    sendSuccess(res, intent, 201);
  } catch (err) {
    next(err);
  }
}

export async function recordCash(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentService.recordCashPayment(req.body, req.user!);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function refund(req: Request, res: Response, next: NextFunction) {
  try {
    const bill = await paymentService.refundPayment(req.params.id as string, req.body, req.user!);
    sendSuccess(res, bill);
  } catch (err) {
    next(err);
  }
}

export async function history(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentService.getPaymentHistory(
      req.validated?.query ?? req.query,
      req.user!,
    );
    sendPaginated(res, result.payments, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
}

export async function receipt(req: Request, res: Response, next: NextFunction) {
  try {
    const { doc, filename } = await paymentService.generateReceiptPdf(
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

/**
 * Webhooks are unauthenticated by nature — the signature is the authentication.
 * `req.body` here is a raw Buffer, mounted with express.raw() before express.json().
 */
export async function stripeWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") {
      throw new AppError("Missing stripe-signature header", 400);
    }
    const result = await paymentService.handleWebhook("stripe", req.body as Buffer, signature);
    // Always 200 once verified — a non-2xx makes Stripe retry an event we have
    // already recorded.
    res.status(200).json({ received: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function razorpayWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    if (typeof signature !== "string") {
      throw new AppError("Missing x-razorpay-signature header", 400);
    }
    const result = await paymentService.handleWebhook("razorpay", req.body as Buffer, signature);
    res.status(200).json({ received: true, ...result });
  } catch (err) {
    next(err);
  }
}
