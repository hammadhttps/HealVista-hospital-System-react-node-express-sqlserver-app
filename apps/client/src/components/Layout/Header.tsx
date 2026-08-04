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
    <header className="flex h-16 w-full items-center justify-between border-b border-border bg-card px-8">
      <div className="text-xl font-semibold text-primary">{t("common:appName")}</div>
      <div className="flex items-center gap-4">
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label={t("a11y:openSearch")}
            aria-keyshortcuts="Meta+K Control+K"
            className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("common:search")}</span>
            <kbd className="hidden rounded border border-border px-1 text-xs sm:inline">⌘K</kbd>
          </button>
        )}
        {user?.role === "PATIENT" && <ProfileSwitcher />}
        <LanguageSwitcher />
        <ThemeToggle />
        <NotificationBell />
        <div className="font-medium text-foreground">
          {user?.email}
          {user?.role && <span className="ms-2 text-sm text-muted-foreground">({user.role})</span>}
        </div>
        <div
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-bold text-primary"
        >
          {user?.email?.[0]?.toUpperCase()}
        </div>
      </div>
    </header>
  );
}
