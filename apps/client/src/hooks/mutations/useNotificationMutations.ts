import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationApi } from "../../api/notifications";
import { notificationKeys } from "../queries/useNotifications";

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationApi.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount });
    },
  });
}

export function useMarkReadBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationApi.markReadBatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount });
    },
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationApi.updatePreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.preferences });
    },
  });
}
