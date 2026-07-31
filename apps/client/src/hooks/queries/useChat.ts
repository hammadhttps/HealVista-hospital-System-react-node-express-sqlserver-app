import { useQuery } from "@tanstack/react-query";
import { chatApi } from "../../api/notifications";

export const chatKeys = {
  threads: ["chat", "threads"] as const,
  messages: (threadId: string, page?: number) => ["chat", "messages", threadId, page] as const,
};

export function useChatThreads() {
  return useQuery({
    queryKey: chatKeys.threads,
    queryFn: chatApi.getThreads,
  });
}

export function useChatMessages(threadId: string, page = 1) {
  return useQuery({
    queryKey: chatKeys.messages(threadId, page),
    queryFn: () => chatApi.getMessages(threadId, { page, limit: 50 }),
    enabled: !!threadId,
  });
}
