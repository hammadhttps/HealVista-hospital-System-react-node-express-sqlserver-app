import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.js";

const hits = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf) return cf;
  return req.ip || "unknown";
}

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = clientIp(req);
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      next(new AppError("Too many requests. Try again later.", 429));
      return;
    }

    entry.count++;
    next();
  };
}

// Cleanup stale entries every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now > entry.resetAt) hits.delete(key);
    }
  },
  5 * 60 * 1000,
);
