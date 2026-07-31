import { useNotifications } from "../../hooks/queries/useNotifications";
import { useMarkRead } from "../../hooks/mutations/useNotificationMutations";
import { formatDistanceToNow } from "date-fns";

interface Props {
  onClose: () => void;
  onMarkAllRead: () => void;
}

export function NotificationPanel({ onClose, onMarkAllRead }: Props) {
  const { data, isLoading } = useNotifications({ limit: 20 });
  const markRead = useMarkRead();
  const notifications = data?.data ?? data ?? [];

  const getIcon = (type: string) => {
    switch (type) {
      case "APPOINTMENT_CONFIRMED":
        return "📅";
      case "APPOINTMENT_RESCHEDULED":
        return "🔄";
      case "APPOINTMENT_CANCELLED":
        return "❌";
      case "APPOINTMENT_REMINDER":
        return "⏰";
      case "PAYMENT_RECEIPT":
        return "💰";
      case "LAB_RESULT_READY":
        return "🔬";
      case "LOW_STOCK_ALERT":
        return "📦";
      case "CHAT_MESSAGE":
        return "💬";
      default:
        return "🔔";
    }
  };

  if (isLoading) {
    return (
      <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50">
        <div className="p-4 text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50 max-h-96 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm">Notifications</h3>
        <button onClick={onMarkAllRead} className="text-xs text-blue-600 hover:underline">
          Mark all read
        </button>
      </div>
      <div className="overflow-y-auto flex-1">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No notifications</div>
        ) : (
          notifications.map((n: any) => (
            <button
              key={n.id}
              onClick={() => {
                if (!n.isRead) markRead.mutate(n.id);
              }}
              className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors ${
                !n.isRead ? "bg-blue-50" : ""
              }`}
            >
              <div className="flex gap-2">
                <span className="text-lg">{getIcon(n.type)}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${!n.isRead ? "font-semibold" : ""}`}>{n.title}</p>
                  <p className="text-xs text-gray-500 truncate">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
