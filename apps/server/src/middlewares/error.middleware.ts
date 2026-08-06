import { Request, Response, NextFunction } from "express";
import { ZodError, ZodIssue } from "zod";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";
import { AppError } from "../utils/AppError.js";
import { PaymentProviderUnavailable } from "../services/payments/PaymentProvider.js";
import { logger } from "../utils/logger.js";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const request = {
    method: req.method,
    url: req.originalUrl,
    reqId: req.correlationId ?? "unknown",
  };

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  if (err instanceof ZodError) {
    const fields = err.issues.map((e: ZodIssue) => ({
      path: e.path.join("."),
      message: e.message,
    }));
    res.status(400).json({
      success: false,
      error: "Validation error",
      fields,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({
        success: false,
        error: "A record with this value already exists",
      });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({
        success: false,
        error: "Record not found",
      });
      return;
    }
  }

  // A gateway that is not configured is an operator problem, not a crash. Fail
  // with an explicit 503 so the client can offer the cash fallback instead of
  // hammering an endpoint that can never succeed.
  if (err instanceof PaymentProviderUnavailable) {
    logger.warn({ err, ...request }, "Payment provider is not configured");
    res.status(503).json({ success: false, error: err.message });
    return;
  }

  // Stripe SDK errors carry their own HTTP status (a declined card is a 402, an
  // invalid/expired key a 401). Surface that status and Stripe's message instead
  // of collapsing everything into a generic 500 that the client retries blindly.
  if (err instanceof Stripe.errors.StripeError) {
    const status =
      err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502;
    logger.error({ err, ...request, type: err.type, code: err.code }, "Stripe API error");
    res.status(status).json({ success: false, error: err.message });
    return;
  }

  logger.error({ err, ...request }, "Unhandled error");
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
}
