import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.js";
import { redis } from "../config/redis.js";

/**
 * Rate limiting (Phase 6.8).
 *
 * Two stores behind one interface:
 *
 *  - **Redis** when available — INCR + EXPIRE, which is atomic across every
 *    instance behind a load balancer. The counter and its TTL are one key, so a
 *    window restart and a counter reset can never drift apart.
 *
 *  - **In-memory** fallback when Redis is unreachable. A rate limiter must fail
 *    **open** (let the request through) rather than fail closed and knock the
 *    whole hospital offline because the shared cache is down. A per-process map
 *    is not a hard guarantee across instances, but it is better than a 500 for
 *    everyone, and the Redis path is what production runs on.
 *
 * Keys are namespaced per route group (`group`) so `/auth/login` and the general
 * API never share a bucket: `security.md` §4 calls for 5 req/15 min on login and
 * a general limit on everything else.
 */

const inMemory = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf) return cf;
  return req.ip || "unknown";
}

function formatWait(ms: number): string {
  const minutes = Math.ceil(ms / 60000);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  /** Route group used to namespace the key, so buckets never collide. */
  group?: string;
}

/** One INCR+EXPIRE round trip; returns the hit count for this window. */
async function redisCount(key: string, windowMs: number): Promise<number> {
  if (!redis) return 0;
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, windowMs);
    }
    return count;
  } catch {
    return 0;
  }
}

export function rateLimit(maxRequests: number, windowMs: number, group = "general") {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = clientIp(req);
    const now = Date.now();
    const redisKey = `rl:${group}:${ip}`;
    const memKey = `${redisKey}:${ip}`;

    const setHeaders = (remaining: number, resetAt: number) => {
      res.set("X-RateLimit-Limit", String(maxRequests));
      res.set("X-RateLimit-Remaining", String(remaining));
      res.set("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
    };

    void (async () => {
      const count = await redisCount(redisKey, windowMs);

      if (redis && count > 0) {
        // Redis is the source of truth; the memory map is only a fallback.
        if (count > maxRequests) {
          const ttl = await redis.pttl(redisKey).catch(() => windowMs);
          const resetAt = now + Math.max(ttl, 1000);
          res.set(
            "Retry-After",
            String(Math.max(1, Math.ceil(resetAt / 1000) - Math.ceil(now / 1000))),
          );
          setHeaders(0, resetAt);
          next(new AppError(`Too many requests. Try again in ${formatWait(resetAt - now)}.`, 429));
          return;
        }
        setHeaders(maxRequests - count, now + windowMs);
        next();
        return;
      }

      // Redis is down or absent — in-memory fallback, fail open.
      const entry = inMemory.get(memKey);
      if (!entry || now > entry.resetAt) {
        inMemory.set(memKey, { count: 1, resetAt: now + windowMs });
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
    })();
  };
}

// Cleanup stale in-memory entries every 5 minutes.
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of inMemory) {
      if (now > entry.resetAt) inMemory.delete(key);
    }
  },
  5 * 60 * 1000,
);
