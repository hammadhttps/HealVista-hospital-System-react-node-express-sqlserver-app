import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useUnreadCount } from "../../hooks/queries/useNotifications";
import { useMarkAllRead } from "../../hooks/mutations/useNotificationMutations";
import { NotificationPanel } from "./NotificationPanel";
import { useSocket } from "../SocketProvider";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: unreadData } = useUnreadCount();
  const markAllRead = useMarkAllRead();
  const { notificationSocket } = useSocket();
  const [liveCount, setLiveCount] = useState(0);
  const { t } = useTranslation(["notifications"]);

  const serverCount = unreadData?.count ?? 0;
  const count = liveCount > serverCount ? liveCount : serverCount;

  useEffect(() => {
    if (!notificationSocket) return;
    const handler = () => {
      setLiveCount((c) => c + 1);
    };
    notificationSocket.on("notification:new", handler);
    return () => {
      notificationSocket.off("notification:new", handler);
    };
  }, [notificationSocket]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open) setLiveCount(0);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
        aria-label={t("panelTitle")}
      >
        <svg
          className="w-5 h-5 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <NotificationPanel
          onClose={() => setOpen(false)}
          onMarkAllRead={() => markAllRead.mutate()}
        />
      )}
    </div>
  );
}
