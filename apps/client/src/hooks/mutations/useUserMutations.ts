import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "../../api/users";
import { userKeys } from "../queries/useUsers";

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}
