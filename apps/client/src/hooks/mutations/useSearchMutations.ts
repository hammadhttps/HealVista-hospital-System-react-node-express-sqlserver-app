import { useMutation, useQueryClient } from "@tanstack/react-query";
import { searchApi } from "../../api/search";
import { searchKeys } from "../queries/useSearch";

export function useSaveSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ query, label }: { query: string; label?: string }) =>
      searchApi.save(query, label),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchKeys.saved() });
    },
  });
}

export function useDeleteSavedSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => searchApi.removeSaved(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchKeys.saved() });
    },
  });
}

export function useClearSearchHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: searchApi.clearHistory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: searchKeys.history() });
    },
  });
}
