import { useQuery } from "@tanstack/react-query";
import { staffApi } from "../../api/staff";

export const staffKeys = {
  all: ["staff"] as const,
};

export function useStaff() {
  return useQuery({
    queryKey: staffKeys.all,
    queryFn: staffApi.list,
  });
}
