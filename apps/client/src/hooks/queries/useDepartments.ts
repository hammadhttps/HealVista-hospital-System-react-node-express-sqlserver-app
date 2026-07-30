import { useQuery } from "@tanstack/react-query";
import { departmentApi } from "../../api/departments";

export const departmentKeys = {
  all: ["departments"] as const,
};

export function useDepartments() {
  return useQuery({
    queryKey: departmentKeys.all,
    queryFn: departmentApi.list,
  });
}
