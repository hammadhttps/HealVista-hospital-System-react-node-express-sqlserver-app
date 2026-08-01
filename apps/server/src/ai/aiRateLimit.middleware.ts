import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.js";

/**
 * Per-user rate limiting for interactive AI endpoints.
 *
 * The free tier's requests-per-minute cap is a shared resource — one user
 * hammering "summarise my records" can exhaust it for everyone. These limits are
 * keyed by the authenticated user (not the IP), so a single user cannot burn the
 * shared quota. In-memory per process, like the general limiter; Phase 6 moves
 * session state to Redis.
 */

const hits = new Map<string, { count: number; resetAt: number }>();

export function aiRateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.user?.userId ?? clientIp(req);
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
      next(new AppError("Too many AI requests. Try again in a few minutes.", 429));
      return;
    }

    entry.count++;
    setHeaders(maxRequests - entry.count, entry.resetAt);
    next();
  };
}

function clientIp(req: Request): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf) return cf;
  return req.ip || "unknown";
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
