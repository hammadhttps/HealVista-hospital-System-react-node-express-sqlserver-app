import { useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../../api/settings";
import { settingsKeys } from "../queries/useSettings";

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: settingsApi.update,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}
