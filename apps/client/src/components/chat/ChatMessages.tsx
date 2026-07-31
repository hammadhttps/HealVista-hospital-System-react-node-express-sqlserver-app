import { useEffect, useRef, useState } from "react";
import { useChatMessages } from "../../hooks/queries/useChat";
import { useSendMessage } from "../../hooks/mutations/useChatMutations";
import { useSocket } from "../SocketProvider";
import { useAuthStore } from "../../store/authStore";
import { MessageBubble } from "./MessageBubble";

interface Props {
  threadId: string;
  onClose: () => void;
}

export function ChatMessages({ threadId, onClose }: Props) {
  const { data, isLoading } = useChatMessages(threadId);
  const sendMessage = useSendMessage(threadId);
  const { chatSocket } = useSocket();
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

    chatSocket.on("chat:typing", onTyping);
    chatSocket.on("chat:stop_typing", onStopTyping);

    return () => {
      chatSocket.off("chat:typing", onTyping);
      chatSocket.off("chat:stop_typing", onStopTyping);
    };
  }, [chatSocket, threadId, currentUserId]);

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
        <h3 className="font-semibold text-sm">Chat</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          &times;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-gray-50">
        {isLoading ? (
          <div className="text-center text-gray-400 py-8">Loading...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-400 py-8">No messages yet. Say hello!</div>
        ) : (
          messages.map((msg: any) => (
            <MessageBubble key={msg.id} message={msg} isOwn={msg.sender.id === currentUserId} />
          ))
        )}
        {typingUsers.length > 0 && (
          <div className="text-xs text-gray-400 italic">Someone is typing...</div>
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
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!content.trim() || sendMessage.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
