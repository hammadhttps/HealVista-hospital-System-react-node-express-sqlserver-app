import { PrismaClient } from "@prisma/client";

/**
 * The shared Prisma client.
 *
 * **Connection pool sizing.** Prisma defaults to `num_cpus * 2 + 1` client
 * connections, which on a small instance is around 9–17. That is not enough
 * here: several endpoints deliberately fan their queries out in parallel (see
 * `dashboard.service.ts`), so one in-flight request can hold six connections at
 * once, and a handful of concurrent users then exhaust the pool and fail with
 * P2024 "Timed out fetching a new connection".
 *
 * Raising it is safe because the app connects through the **Neon pooler**
 * (pgbouncer), whose entire job is to multiplex many short-lived client
 * connections onto a small number of real Postgres backends. The limit that
 * matters to Postgres is pgbouncer's, not ours.
 *
 * Both values are overridable from `DATABASE_URL` — anything already present in
 * the connection string wins, so an operator can tune this without a code change.
 */
const DEFAULT_CONNECTION_LIMIT = "25";
const DEFAULT_POOL_TIMEOUT = "20";

function withPoolSettings(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", DEFAULT_CONNECTION_LIMIT);
    }
    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set("pool_timeout", DEFAULT_POOL_TIMEOUT);
    }
    return parsed.toString();
  } catch {
    // A malformed URL is Prisma's error to report, with its own clear message —
    // not something to swallow or half-rewrite here.
    return url;
  }
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: withPoolSettings(process.env.DATABASE_URL) } },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
