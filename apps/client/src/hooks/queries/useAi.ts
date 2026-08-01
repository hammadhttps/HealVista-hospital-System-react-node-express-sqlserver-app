import { useQuery } from "@tanstack/react-query";
import { aiApi, kbApi } from "../../api/ai";

export const aiKeys = {
  all: ["ai"] as const,
  timeline: (patientId: string) => ["ai", "timeline", patientId] as const,
  recordSummary: (recordId: string) => ["ai", "record-summary", recordId] as const,
};

export const kbKeys = {
  all: ["kb"] as const,
  list: ["kb", "list"] as const,
  detail: (id: string) => ["kb", "detail", id] as const,
};

/**
 * Chronological AI summary of a patient's history. A query (GET) so the doctor's
 * panel loads it once and the server's Redis cache absorbs repeat visits.
 */
export function useTimelineSummary(patientId: string) {
  return useQuery({
    queryKey: aiKeys.timeline(patientId),
    queryFn: () => aiApi.timelineSummary(patientId),
    enabled: !!patientId,
    staleTime: 5 * 60_000,
  });
}

/**
 * A stored report summary. Refetching after the summarize job finishes is handled
 * by invalidating `aiKeys.recordSummary` — the query itself just reads the cache.
 */
export function useRecordSummary(recordId: string) {
  return useQuery({
    queryKey: aiKeys.recordSummary(recordId),
    queryFn: () => aiApi.recordSummary(recordId),
    enabled: !!recordId,
  });
}

export function useKbArticles() {
  return useQuery({ queryKey: kbKeys.list, queryFn: () => kbApi.list() });
}

export function useKbArticle(id: string) {
  return useQuery({
    queryKey: kbKeys.detail(id),
    queryFn: () => kbApi.get(id),
    enabled: !!id,
  });
}
