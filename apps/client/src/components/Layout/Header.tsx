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
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-border bg-card/90 px-4 shadow-sm backdrop-blur sm:px-6 lg:px-8">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("common:appName")}
        </div>
        {user?.role && (
          <div className="truncate text-base font-semibold text-foreground">
            {user.role.replace("_", " ")} workspace
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label={t("a11y:openSearch")}
            aria-keyshortcuts="Meta+K Control+K"
            className="flex h-9 items-center gap-2 rounded-md border border-border bg-background/80 px-3 text-sm text-muted-foreground shadow-sm transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("common:search")}</span>
            <kbd className="hidden rounded border border-border px-1 text-xs sm:inline">Ctrl K</kbd>
          </button>
        )}
        {user?.role === "PATIENT" && <ProfileSwitcher />}
        <LanguageSwitcher />
        <ThemeToggle />
        <NotificationBell />
        <div className="hidden max-w-56 text-right text-sm font-medium text-foreground xl:block">
          <div className="truncate">{user?.email}</div>
          {user?.role && (
            <div className="text-xs font-normal text-muted-foreground">{user.role}</div>
          )}
        </div>
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary ring-1 ring-primary/20"
        >
          {user?.email?.[0]?.toUpperCase()}
        </div>
      </div>
    </header>
  );
}
