import api from "./axiosClient";

export const notificationApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/notifications", { params }).then((r) => r.data),

  unreadCount: () => api.get("/notifications/unread-count").then((r) => r.data.data),

  markRead: (id: string) => api.patch(`/notifications/${id}/read`).then((r) => r.data.data),

  markReadBatch: (ids: string[]) =>
    api.patch("/notifications/read", { ids }).then((r) => r.data.data),

  markAllRead: () => api.patch("/notifications/read-all").then((r) => r.data.data),

  getPreferences: () => api.get("/notifications/preferences").then((r) => r.data.data),

  updatePreferences: (data: Record<string, boolean>) =>
    api.put("/notifications/preferences", data).then((r) => r.data.data),
};

/** One chat message, as returned by the API and pushed over the socket. */
export interface ChatMessage {
  id: string;
  threadId: string;
  content: string;
  sentAt: string;
  readAt: string | null;
  sender: {
    id: string;
    email: string;
    role: string;
    avatarUrl: string | null;
  };
}

export interface ChatMessagePage {
  data: ChatMessage[];
  total: number;
}

export const chatApi = {
  getThreads: () => api.get("/chat/threads").then((r) => r.data.data),

  getMessages: (threadId: string, params?: Record<string, unknown>) =>
    api
      .get(`/chat/threads/${threadId}/messages`, { params })
      .then((r) => r.data as ChatMessagePage),

  sendMessage: (threadId: string, content: string) =>
    api.post(`/chat/threads/${threadId}/messages`, { content }).then((r) => r.data.data),

  markRead: (threadId: string) =>
    api.patch(`/chat/threads/${threadId}/read`).then((r) => r.data.data),
};
