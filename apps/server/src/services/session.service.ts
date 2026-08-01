import { prisma } from "../config/db.js";
import { redis, cacheKeys } from "../config/redis.js";

/**
 * Session state in Redis.
 *
 * The problem this solves: `authenticate` verified the JWT signature and nothing
 * else, so revoking a session — logging out another device, an admin killing a
 * compromised login — did nothing until the access token expired on its own. The
 * session row said "revoked" and the token kept working.
 *
 * Checking Postgres on every request would fix that and add a query to every
 * single API call. Instead Redis holds the hot state:
 *
 *  - Postgres `user_sessions` stays the source of truth and the audit record.
 *  - Redis holds a **revocation marker** per session, set the moment a session
 *    is revoked and expiring on its own once no live token could still carry it.
 *
 * That makes the common path (a valid session) a single Redis GET, and the
 * revocation take effect on the next request rather than up to 15 minutes later.
 *
 * Fail-open is deliberate: if Redis is unreachable we do **not** reject every
 * request. An access token is short-lived and already signature-verified, so the
 * exposure is bounded, whereas failing closed would take the whole hospital
 * offline because a cache is down.
 */

/** Long enough to outlive any access token that could still be in flight. */
const REVOCATION_TTL_SECONDS = 24 * 60 * 60;

export async function revokeSession(sessionId: string): Promise<void> {
  if (!redis || !sessionId) return;
  try {
    await redis.setex(cacheKeys.session(sessionId), REVOCATION_TTL_SECONDS, "1");
  } catch {
    // The Postgres revokedAt write is the durable record; Redis is the fast path.
  }
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  const sessions = await prisma.userSession.findMany({
    where: { userId, revokedAt: null },
    select: { id: true },
  });
  await Promise.all(sessions.map((s) => revokeSession(s.id)));
}

/**
 * True when this session must no longer be accepted.
 *
 * Redis answers the common case. On a miss we do not assume "fine" — a cold or
 * evicted Redis would silently re-enable every revoked session — so a miss falls
 * through to Postgres once and the result is cached back.
 */
export async function isSessionRevoked(sessionId: string): Promise<boolean> {
  if (!sessionId) return false;

  if (redis) {
    try {
      const marker = await redis.get(cacheKeys.session(sessionId));
      if (marker === "1") return true;
      if (marker === "0") return false;
    } catch {
      // Fall through to the database.
    }
  }

  const session = await prisma.userSession.findUnique({
    where: { id: sessionId },
    select: { revokedAt: true },
  });

  // An unknown session id is treated as revoked: it either never existed or has
  // been deleted, and neither should keep working.
  const revoked = !session || session.revokedAt !== null;

  if (redis) {
    try {
      await redis.setex(
        cacheKeys.session(sessionId),
        revoked ? REVOCATION_TTL_SECONDS : 300,
        revoked ? "1" : "0",
      );
    } catch {
      // silent
    }
  }

  return revoked;
}

/** Best-effort last-seen tracking, written to Redis rather than Postgres. */
export async function touchSession(sessionId: string): Promise<void> {
  if (!redis || !sessionId) return;
  try {
    await redis.setex(`session:seen:${sessionId}`, 15 * 60, String(Date.now()));
  } catch {
    // silent
  }
}

/** The last-seen time for a session, if Redis has one. */
export async function getLastSeen(sessionId: string): Promise<Date | null> {
  if (!redis || !sessionId) return null;
  try {
    const value = await redis.get(`session:seen:${sessionId}`);
    return value ? new Date(Number(value)) : null;
  } catch {
    return null;
  }
}
