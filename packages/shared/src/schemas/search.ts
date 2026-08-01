import { z } from "zod";

/**
 * Global keyword search (Phase 6.3).
 *
 * Postgres full-text search (`tsvector` + GIN) over patients, doctors,
 * appointments, medicines, lab orders, and invoices. This is keyword search and
 * is deliberately distinct from Phase 5's pgvector semantic search: it matches
 * identifiers and names literally, so an MRN or a bill number resolves exactly.
 *
 * Results are filtered by the caller's role **in SQL**, before anything is
 * returned — a pharmacist searching a drug name never sees patient records.
 */

export const SEARCH_MIN_LENGTH = 2;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(SEARCH_MIN_LENGTH).max(120),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

/** The entity kinds global search can return. Drives the badge on each result. */
export const SEARCH_RESULT_TYPES = [
  "patient",
  "doctor",
  "appointment",
  "medicine",
  "labOrder",
  "invoice",
] as const;

export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  href: string;
}

export interface SearchResultGroup {
  type: SearchResultType;
  label: string;
  results: SearchResult[];
}

export interface SearchResponse {
  query: string;
  groups: SearchResultGroup[];
  total: number;
}

export const saveSearchSchema = z.object({
  query: z.string().trim().min(SEARCH_MIN_LENGTH).max(120),
  label: z.string().trim().min(1).max(80).optional(),
});

export type SaveSearchInput = z.infer<typeof saveSearchSchema>;

export interface SearchHistoryEntry {
  id: string;
  query: string;
  createdAt: string;
}

export interface SavedSearchEntry {
  id: string;
  query: string;
  label: string | null;
  createdAt: string;
}
