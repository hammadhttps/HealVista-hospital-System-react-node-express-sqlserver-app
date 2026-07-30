import { Request, Response, NextFunction } from "express";
import { ZodError, ZodIssue } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
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

  logger.error({ err, reqId: (req as any).correlationId }, "Unhandled error");
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
}
