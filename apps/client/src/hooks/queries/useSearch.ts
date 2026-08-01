import { useQuery } from "@tanstack/react-query";
import { SEARCH_MIN_LENGTH } from "@healvista/shared";
import { searchApi } from "../../api/search";

export const searchKeys = {
  all: ["search"] as const,
  query: (q: string) => [...searchKeys.all, "query", q] as const,
  history: () => [...searchKeys.all, "history"] as const,
  saved: () => [...searchKeys.all, "saved"] as const,
};

/**
 * Runs only once the (already debounced) term reaches the minimum length, so
 * typing a single character never hits the server. Results are kept briefly so
 * reopening the palette with the same term is instant.
 */
export function useGlobalSearch(term: string, enabled = true) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: searchKeys.query(trimmed),
    queryFn: () => searchApi.search(trimmed),
    enabled: enabled && trimmed.length >= SEARCH_MIN_LENGTH,
    staleTime: 30_000,
  });
}

export function useSearchHistory(enabled = true) {
  return useQuery({
    queryKey: searchKeys.history(),
    queryFn: searchApi.history,
    enabled,
  });
}

export function useSavedSearches(enabled = true) {
  return useQuery({
    queryKey: searchKeys.saved(),
    queryFn: searchApi.saved,
    enabled,
  });
}
