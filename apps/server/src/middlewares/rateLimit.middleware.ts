import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.js";

const hits = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf) return cf;
  return req.ip || "unknown";
}

function formatWait(ms: number): string {
  const minutes = Math.ceil(ms / 60000);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = clientIp(req);
    const now = Date.now();
    const entry = hits.get(key);

    const setHeaders = (remaining: number, resetAt: number) => {
      res.set("X-RateLimit-Limit", String(maxRequests));
      res.set("X-RateLimit-Remaining", String(remaining));
      res.set("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
    };

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      setHeaders(maxRequests - 1, now + windowMs);
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.set("Retry-After", String(retryAfterSeconds));
      setHeaders(0, entry.resetAt);
      next(
        new AppError(`Too many requests. Try again in ${formatWait(entry.resetAt - now)}.`, 429),
      );
      return;
    }

    entry.count++;
    setHeaders(maxRequests - entry.count, entry.resetAt);
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
