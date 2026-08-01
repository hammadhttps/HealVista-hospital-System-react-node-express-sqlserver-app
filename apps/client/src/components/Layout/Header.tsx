import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/authStore";
import { NotificationBell } from "../notifications/NotificationBell";
import ProfileSwitcher from "./ProfileSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";

export default function Header({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation(["common", "a11y"]);

  return (
    <header className="flex h-16 w-full items-center justify-between bg-white px-8 shadow dark:bg-gray-800">
      <div className="text-xl font-semibold text-blue-700 dark:text-blue-300">
        {t("common:appName")}
      </div>
      <div className="flex items-center gap-4">
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label={t("a11y:openSearch")}
            aria-keyshortcuts="Meta+K Control+K"
            className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("common:search")}</span>
            <kbd className="hidden rounded border border-gray-300 px-1 text-xs sm:inline dark:border-gray-600">
              ⌘K
            </kbd>
          </button>
        )}
        {user?.role === "PATIENT" && <ProfileSwitcher />}
        <LanguageSwitcher />
        <ThemeToggle />
        <NotificationBell />
        <div className="font-medium text-gray-700 dark:text-gray-200">
          {user?.email}
          {user?.role && <span className="ms-2 text-sm text-gray-400">({user.role})</span>}
        </div>
        <div
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-600 dark:bg-blue-900 dark:text-blue-200"
        >
          {user?.email?.[0]?.toUpperCase()}
        </div>
      </div>
    </header>
  );
}
