import { createHash } from "node:crypto";
import { getCached, setCached } from "../config/redis.js";

/**
 * Redis answer cache for RAG responses (Phase 5.5).
 *
 * ai-rag.md §9: cache RAG answers keyed by `hash(question + scope)` with a short
 * TTL. Every interactive AI call is a shared free-tier token, so a repeat question
 * should never re-embed, re-retrieve, and re-generate. The digest is truncated to
 * keep keys short; the scope is part of the key so one user's cached answer can
 * never be served to another.
 */

export function answerCacheKey(namespace: string, ...parts: (string | number)[]): string {
  const joined = parts.map((p) => String(p)).join("|");
  const digest = createHash("sha256").update(joined).digest("hex").slice(0, 32);
  return `ai:${namespace}:${digest}`;
}

export async function getCachedAnswer<T>(key: string): Promise<T | null> {
  return getCached<T>(key);
}

export async function setCachedAnswer(key: string, value: unknown, ttlSec = 900): Promise<void> {
  await setCached(key, value, ttlSec);
}
