import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import Stripe from "stripe";
import { errorHandler } from "./error.middleware.js";
import { PaymentProviderUnavailable } from "../services/payments/PaymentProvider.js";
import { AppError } from "../utils/AppError.js";

function mockRes() {
  const res: Partial<Response> = { statusCode: 0 };
  res.status = vi.fn().mockReturnValue(res as Response);
  res.json = vi.fn().mockReturnValue(res as Response);
  return res as unknown as Response;
}

const mockReq = {
  method: "POST",
  originalUrl: "/api/payments/create-intent",
  correlationId: "test-1",
} as unknown as Request;

describe("errorHandler", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps an unconfigured payment provider to 503 with its message", () => {
    const res = mockRes();
    errorHandler(new PaymentProviderUnavailable("stripe"), mockReq, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining("stripe payment provider is not configured"),
    });
  });

  it("maps a Stripe SDK error to its own status instead of a generic 500", () => {
    const res = mockRes();
    const stripeError = new Stripe.errors.StripeAuthenticationError({
      message: "Invalid API Key provided",
      statusCode: 401,
    });
    errorHandler(stripeError, mockReq, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Invalid API Key provided",
    });
  });

  it("falls through to AppError handling unchanged", () => {
    const res = mockRes();
    errorHandler(new AppError("Not authorised", 403), mockReq, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: "Not authorised" });
  });
});
