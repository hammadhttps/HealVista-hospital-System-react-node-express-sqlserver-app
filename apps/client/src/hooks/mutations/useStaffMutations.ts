import { useMutation, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "../../api/staff";
import { staffKeys } from "../queries/useStaff";

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: string;
      data: { departmentId?: string; designation?: string; status?: string };
    }) => staffApi.update(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
  });
}
