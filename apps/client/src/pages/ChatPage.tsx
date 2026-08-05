import { useSearchParams } from "react-router-dom";
import { ChatList } from "../components/chat/ChatList";

export default function ChatPage() {
  const [searchParams] = useSearchParams();
  const thread = searchParams.get("thread");

  return (
    <div className="h-[calc(100vh-8rem)] max-w-4xl mx-auto">
      <ChatList initialThread={thread ?? undefined} />
    </div>
  );
}
