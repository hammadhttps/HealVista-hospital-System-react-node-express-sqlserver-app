import { useQuery } from "@tanstack/react-query";
import { usersApi } from "../../api/users";

export const userKeys = {
  all: ["users"] as const,
  list: (params: { search?: string; role?: string }) => [...userKeys.all, { params }] as const,
};

export function useUsers(params: { search?: string; role?: string }) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => usersApi.list(params),
  });
}
