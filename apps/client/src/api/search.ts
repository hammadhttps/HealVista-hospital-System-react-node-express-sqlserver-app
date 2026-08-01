import api from "./axiosClient";
import type { SavedSearchEntry, SearchHistoryEntry, SearchResponse } from "@healvista/shared";

/**
 * Global keyword search (Phase 6.3). Results are already role-filtered by the
 * server — the client renders whatever groups come back and never decides
 * visibility itself.
 */
export const searchApi = {
  search: (q: string, limit?: number) =>
    api
      .get("/search", { params: { q, ...(limit ? { limit } : {}) } })
      .then((r) => r.data.data as SearchResponse),

  history: () => api.get("/search/history").then((r) => r.data.data as SearchHistoryEntry[]),
  clearHistory: () => api.delete("/search/history").then((r) => r.data.data),

  saved: () => api.get("/search/saved").then((r) => r.data.data as SavedSearchEntry[]),
  save: (query: string, label?: string) =>
    api.post("/search/saved", { query, label }).then((r) => r.data.data as SavedSearchEntry),
  removeSaved: (id: string) => api.delete(`/search/saved/${id}`).then((r) => r.data.data),
};
