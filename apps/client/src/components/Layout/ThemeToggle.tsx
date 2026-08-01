import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { Monitor, Moon, Sun } from "lucide-react";

/**
 * Light / dark / system switcher (Phase 6.7).
 *
 * Three options rather than a binary toggle: "system" is the honest default —
 * a clinician on a night shift has already told their OS what they want, and a
 * two-state toggle silently overrides that.
 *
 * Rendered as a radio group so the current choice is announced, rather than a
 * button whose label has to describe a state change.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation("common");

  const options = [
    { value: "light", label: t("themeLight"), Icon: Sun },
    { value: "dark", label: t("themeDark"), Icon: Moon },
    { value: "system", label: t("themeSystem"), Icon: Monitor },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t("theme")}
      className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5 dark:border-gray-600"
    >
      {options.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              active
                ? "bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-50"
                : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700/50"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
