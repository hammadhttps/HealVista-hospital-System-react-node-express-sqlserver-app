import { useQuery } from "@tanstack/react-query";
import { notificationApi } from "../../api/notifications";

export const notificationKeys = {
  list: (params?: Record<string, unknown>) => ["notifications", "list", params] as const,
  unreadCount: ["notifications", "unreadCount"] as const,
  preferences: ["notifications", "preferences"] as const,
};

export function useNotifications(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => notificationApi.list(params),
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: notificationApi.unreadCount,
    refetchInterval: 30000,
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences,
    queryFn: notificationApi.getPreferences,
  });
}
