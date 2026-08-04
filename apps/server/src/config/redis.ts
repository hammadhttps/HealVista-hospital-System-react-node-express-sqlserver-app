import { Redis, type RedisOptions } from "ioredis";
import { env } from "./env.js";

/**
 * Redis connections.
 *
 * Two clients, deliberately, because they need opposite failure behaviour:
 *
 *  - `redis` (cache, sessions, locks) uses a **bounded** retry and a command
 *    timeout. `maxRetriesPerRequest: null` — which BullMQ requires — makes a
 *    command retry *forever* when Redis is unreachable, so a Redis blip turns
 *    into hung API requests rather than a degraded one. Caching must fail open.
 *
 *  - `bullConnection` keeps `maxRetriesPerRequest: null`, which BullMQ mandates
 *    for its blocking commands, and is used only by queues and workers.
 *
 * Everything cached here is derived data with Postgres as the source of truth,
 * so an eviction or a cold Redis costs latency, never correctness.
 *
 * ─── Turning Redis off ──────────────────────────────────────────────────────
 *
 * `REDIS_ENABLED=false` disables it completely: no connections are opened and
 * every helper below returns as though the cache missed. Set it when the Upstash
 * free tier hits its 500,000-command monthly quota — past that point every
 * command is rejected anyway, and an app that keeps trying just pays the latency
 * of a failing round trip on every request.
 *
 * What is lost while it is off, and why none of it is data:
 *
 *  - Caching. Every read falls through to Postgres. Slower, never wrong.
 *  - Session revocation markers. `isSessionRevoked` already falls back to
 *    Postgres, which is the source of truth; revocation still works.
 *  - Slot locks. Two receptionists could hold the same slot for the seconds
 *    before the unique constraint rejects the second booking. The constraint is
 *    what actually guarantees this, not the lock.
 *  - BullMQ queues and their workers do not start. Reminders and embedding
 *    backfill pause; `npm run db:embed` catches up the embeddings afterwards.
 *  - Socket.io drops to its in-memory adapter — correct on a single instance,
 *    which is what this deployment runs.
 *
 * Nothing here is a store of record. That is the property that makes switching
 * it off a degradation rather than an outage.
 */

/**
 * Also worth knowing if you are looking at quota: Upstash's free tier reports
 * `optimistic-volatile` eviction, not `noeviction`. Keys can therefore be
 * dropped under memory pressure — which is exactly why messages, sessions and
 * every cached aggregate keep Postgres as their source of truth and treat Redis
 * purely as a front. The eviction policy is a property of the Upstash plan and
 * is not settable over the wire; it is not a bug to fix in code.
 */
const redisEnabled = env.REDIS_ENABLED && Boolean(env.REDIS_URL);

const redisUrl = redisEnabled ? env.REDIS_URL : undefined;

if (!redisEnabled) {
  console.warn(
    env.REDIS_URL
      ? "[redis] disabled via REDIS_ENABLED=false — caching, queues and locks are off; Postgres serves everything"
      : "[redis] no REDIS_URL — caching, queues and locks are off; Postgres serves everything",
  );
}

/** True when Redis is available. Read this rather than testing the client. */
export const isRedisEnabled = redisEnabled;

const baseOptions: RedisOptions = {
  enableReadyCheck: false,
  lazyConnect: false,
  // Give up rather than queue commands forever while Redis is down.
  enableOfflineQueue: false,
  retryStrategy: (times) => (times > 10 ? null : Math.min(times * 200, 5000)),
};

export const redis = redisUrl
  ? new Redis(redisUrl, {
      ...baseOptions,
      maxRetriesPerRequest: 2,
      // A cache read that takes longer than this is worse than a cache miss.
      commandTimeout: 1000,
    })
  : null;

/** BullMQ's connection. Blocking commands require unbounded retries. */
export const bullConnection = redisUrl
  ? new Redis(redisUrl, { ...baseOptions, enableOfflineQueue: true, maxRetriesPerRequest: null })
  : null;

/**
 * A fresh connection for the Socket.io Redis adapter.
 *
 * The adapter needs its own pair: once a client issues SUBSCRIBE it enters
 * subscriber mode and can no longer run ordinary commands, so sharing `redis`
 * here would break every cache read in the app. `enableOfflineQueue` is on
 * because a dropped pub/sub message is a lost real-time event, not a slow one.
 */
export function createSocketAdapterConnection(): Redis | null {
  if (!redisUrl) return null;
  return new Redis(redisUrl, {
    ...baseOptions,
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
  });
}

for (const [name, client] of [
  ["cache", redis],
  ["bull", bullConnection],
] as const) {
  if (!client) continue;
  client.on("error", (err) => console.error(`[redis:${name}]`, err.message));
  client.on("connect", () => console.log(`[redis:${name}] connected`));
}

export async function getCached<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Fail open: a cache problem must never surface as a request failure.
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

export async function delCached(...keys: string[]): Promise<void> {
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch {
    // silent
  }
}

/**
 * Deletes every key under a prefix.
 *
 * Uses SCAN, never KEYS: `KEYS *` blocks the single Redis thread for the whole
 * scan, which on a shared instance stalls every other client in the app.
 */
export async function delCachedByPrefix(prefix: string): Promise<void> {
  if (!redis) return;
  try {
    let cursor = "0";
    do {
      const [next, found] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
      cursor = next;
      if (found.length > 0) await redis.del(...found);
    } while (cursor !== "0");
  } catch {
    // silent
  }
}

/**
 * Read-through cache: return the cached value, or compute, store and return it.
 *
 * The loader runs on a cache miss *and* on any Redis failure, so the caller
 * always gets real data.
 */
export async function cached<T>(key: string, ttlSec: number, loader: () => Promise<T>): Promise<T> {
  const hit = await getCached<T>(key);
  if (hit !== null) return hit;

  const value = await loader();
  await setCached(key, value, ttlSec);
  return value;
}

/** Cache key namespaces, in one place so invalidation can't miss a spelling. */
export const cacheKeys = {
  dashboard: (role: string, userId: string) => `dashboard:${role}:${userId}`,
  dashboardPrefix: "dashboard:",
  analyticsPrefix: "analytics:",
  chatThreads: (userId: string) => `chat:threads:${userId}`,
  chatMessages: (threadId: string, page: number) => `chat:messages:${threadId}:${page}`,
  chatMessagesPrefix: (threadId: string) => `chat:messages:${threadId}:`,
  session: (sessionId: string) => `session:revoked:${sessionId}`,
  departments: "departments:all",
  settings: "settings:hospital",
};
