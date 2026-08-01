import { Search } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { NotificationBell } from "../notifications/NotificationBell";
import ProfileSwitcher from "./ProfileSwitcher";

export default function Header({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const user = useAuthStore((state) => state.user);

  return (
    <header className="w-full h-16 bg-white shadow flex items-center justify-between px-8 dark:bg-gray-800">
      <div className="text-xl font-semibold text-blue-700 dark:text-blue-300">Dashboard</div>
      <div className="flex items-center gap-4">
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Open global search"
            aria-keyshortcuts="Meta+K Control+K"
            className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden rounded border border-gray-300 px-1 text-xs sm:inline dark:border-gray-600">
              ⌘K
            </kbd>
          </button>
        )}
        {user?.role === "PATIENT" && <ProfileSwitcher />}
        <NotificationBell />
        <div className="text-gray-700 font-medium">
          {user?.email}
          {user?.role && <span className="text-sm text-gray-400 ml-2">({user.role})</span>}
        </div>
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-500 font-bold">
          {user?.email?.[0]?.toUpperCase()}
        </div>
      </div>
    </header>
  );
}
