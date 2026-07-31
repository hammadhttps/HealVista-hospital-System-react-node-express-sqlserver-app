import { useMutation, useQueryClient } from "@tanstack/react-query";
import { chatApi } from "../../api/notifications";
import { chatKeys } from "../queries/useChat";

export function useSendMessage(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => chatApi.sendMessage(threadId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(threadId) });
    },
  });
}

export function useMarkChatRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chatApi.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.threads });
    },
  });
}
