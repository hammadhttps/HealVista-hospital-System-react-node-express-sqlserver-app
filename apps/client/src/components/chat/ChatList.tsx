import { useState } from "react";
import { useChatThreads } from "../../hooks/queries/useChat";
import { ChatMessages } from "./ChatMessages";

export function ChatList() {
  const { data: threads, isLoading } = useChatThreads();
  const [activeThread, setActiveThread] = useState<string | null>(null);

  if (isLoading) {
    return <div className="p-4 text-gray-500">Loading chats...</div>;
  }

  if (activeThread) {
    return (
      <div className="h-full">
        <ChatMessages threadId={activeThread} onClose={() => setActiveThread(null)} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border h-full flex flex-col">
      <div className="px-4 py-3 border-b">
        <h3 className="font-semibold">Chats</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!threads || threads.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No conversations yet</div>
        ) : (
          (threads as any[]).map((thread: any) => (
            <button
              key={thread.id}
              onClick={() => setActiveThread(thread.id)}
              className="w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
                  {thread.appointment?.patient?.fullName?.[0] ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {thread.appointment?.patient?.fullName ?? "Chat"}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {thread.appointment?.appointmentNo ?? ""}
                  </p>
                  {thread.messages?.[0] && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {thread.messages[0].content}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
