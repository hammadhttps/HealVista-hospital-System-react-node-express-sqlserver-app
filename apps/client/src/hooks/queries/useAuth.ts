import { useQuery } from "@tanstack/react-query";
import { authApi } from "../../api/auth";

export const authKeys = {
  me: ["auth", "me"] as const,
  sessions: ["auth", "sessions"] as const,
};

export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: authApi.me,
    retry: false,
  });
}

export function useSessions() {
  return useQuery({
    queryKey: authKeys.sessions,
    queryFn: authApi.sessions,
  });
}
