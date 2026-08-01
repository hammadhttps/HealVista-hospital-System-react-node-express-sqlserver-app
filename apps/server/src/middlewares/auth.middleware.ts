import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { isSessionRevoked, touchSession } from "../services/session.service.js";

export interface JwtPayload {
  userId: string;
  role: string;
  sessionId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      correlationId?: string;
      validated?: any;
    }
  }
}

/**
 * Verifies the token **and** that its session is still live.
 *
 * Signature alone is not enough: revoking a session used to have no effect until
 * the access token expired, so "log out my other devices" left those devices
 * working. The session check is a single Redis GET on the common path.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new AppError("Missing or invalid authorization header", 401));
    return;
  }

  const token = header.slice(7);
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
  } catch {
    next(new AppError("Invalid or expired token", 401));
    return;
  }

  // Tokens issued before sessions were tracked carry no sessionId; they simply
  // cannot be revoked early and expire on their own.
  if (!payload.sessionId) {
    req.user = payload;
    next();
    return;
  }

  void isSessionRevoked(payload.sessionId)
    .then((revoked) => {
      if (revoked) {
        next(new AppError("Session has been revoked. Please sign in again.", 401));
        return;
      }
      req.user = payload;
      void touchSession(payload.sessionId!);
      next();
    })
    .catch(() => {
      // Fail open on an infrastructure error: the token is still signature-valid
      // and short-lived, and a cache outage must not lock out the hospital.
      req.user = payload;
      next();
    });
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
    req.user = payload;
  } catch {
    // silently ignore
  }
  next();
}
