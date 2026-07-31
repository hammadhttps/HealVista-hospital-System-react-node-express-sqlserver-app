import { Redis } from "ioredis";
import { env } from "./env.js";

const redisUrl = env.REDIS_URL;

export const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 100, 5000),
    })
  : null;

if (redis) {
  redis.on("error", (err) => console.error("[redis]", err));
  redis.on("connect", () => console.log("[redis] connected"));
}

export async function getCached<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setCached(key: string, value: unknown, ttlSec = 300): Promise<void> {
  if (!redis) return;
  try {
    await redis.setex(key, ttlSec, JSON.stringify(value));
  } catch {
    // silent
  }
}
