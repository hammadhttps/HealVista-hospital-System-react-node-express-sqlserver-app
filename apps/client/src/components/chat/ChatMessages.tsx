import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useChatMessages, chatKeys } from "../../hooks/queries/useChat";
import { useSendMessage } from "../../hooks/mutations/useChatMutations";
import { useSocket } from "../SocketProvider";
import type { ChatMessage, ChatMessagePage } from "../../api/notifications";
import { useAuthStore } from "../../store/authStore";
import { MessageBubble } from "./MessageBubble";

interface Props {
  threadId: string;
  onClose: () => void;
}

export function ChatMessages({ threadId, onClose }: Props) {
  const { t } = useTranslation(["chat", "common"]);
  const { data, isLoading } = useChatMessages(threadId);
  const sendMessage = useSendMessage(threadId);
  const { chatSocket } = useSocket();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [content, setContent] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const messages = data?.data ?? [];
  const currentUserId = user?.id;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!chatSocket) return;

    chatSocket.emit("chat:join", { threadId });

    const onTyping = ({ userId }: { userId: string }) => {
      if (userId !== currentUserId) {
        setTypingUsers((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
      }
    };
    const onStopTyping = ({ userId }: { userId: string }) => {
      setTypingUsers((prev) => prev.filter((id) => id !== userId));
    };

    /**
     * A message arriving from the server.
     *
     * Written straight into the React Query cache rather than triggering a
     * refetch: the payload is the complete message, so a round trip would only
     * add latency to the thing that must feel instant. The thread list is
     * invalidated because its preview and unread count did change.
     */
    const onMessage = (message: ChatMessage) => {
      if (message.threadId !== threadId) return;

      queryClient.setQueryData(
        chatKeys.messages(threadId, 1),
        (previous: ChatMessagePage | undefined) => {
          if (!previous) return previous;
          // The sender already appended it optimistically via the mutation, and
          // the socket echoes to the whole room including them.
          if (previous.data.some((m) => m.id === message.id)) return previous;
          return { ...previous, data: [...previous.data, message], total: previous.total + 1 };
        },
      );
      void queryClient.invalidateQueries({ queryKey: chatKeys.threads });
    };

    const onRead = () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(threadId, 1) });
    };

    // Re-join on every reconnect, or the socket comes back into an empty room
    // after a Render cold start and silently receives nothing.
    const onReconnect = () => chatSocket.emit("chat:join", { threadId });

    chatSocket.on("chat:message", onMessage);
    chatSocket.on("chat:read", onRead);
    chatSocket.on("chat:typing", onTyping);
    chatSocket.on("chat:stop_typing", onStopTyping);
    chatSocket.io.on("reconnect", onReconnect);

    return () => {
      chatSocket.off("chat:message", onMessage);
      chatSocket.off("chat:read", onRead);
      chatSocket.off("chat:typing", onTyping);
      chatSocket.off("chat:stop_typing", onStopTyping);
      chatSocket.io.off("reconnect", onReconnect);
    };
  }, [chatSocket, threadId, currentUserId, queryClient]);

  const handleTyping = () => {
    if (!chatSocket) return;
    chatSocket.emit("chat:typing", { threadId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      chatSocket.emit("chat:stop_typing", { threadId });
    }, 2000);
  };

  const handleSend = async () => {
    if (!content.trim()) return;
    try {
      await sendMessage.mutateAsync(content.trim());
      setContent("");
    } catch {}
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <h3 className="font-semibold text-sm">{t("chat:chat")}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          &times;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-gray-50">
        {isLoading ? (
          <div className="text-center text-gray-400 py-8">{t("common:loading")}</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-400 py-8">{t("chat:noMessages")}</div>
        ) : (
          messages.map((msg: any) => (
            <MessageBubble key={msg.id} message={msg} isOwn={msg.sender.id === currentUserId} />
          ))
        )}
        {typingUsers.length > 0 && (
          <div className="text-xs text-gray-400 italic">{t("chat:typing")}</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t bg-white">
        <div className="flex gap-2">
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              handleTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("chat:placeholder")}
            rows={1}
            className="flex-1 resize-none border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!content.trim() || sendMessage.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {t("chat:send")}
          </button>
        </div>
      </div>
    </div>
  );
}
