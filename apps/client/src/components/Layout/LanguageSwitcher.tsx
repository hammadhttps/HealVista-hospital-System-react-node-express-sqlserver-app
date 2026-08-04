import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { SUPPORTED_LANGUAGES, changeLanguage, type LanguageCode } from "../../i18n";

/**
 * English ⇄ Urdu switcher (Phase 6.7).
 *
 * Switching also flips `<html dir>`, so the entire layout mirrors — which is why
 * this is a plain `<select>` rather than a custom popover: a native control
 * mirrors correctly and is keyboard-accessible without any work.
 */
export function LanguageSwitcher() {
  const { i18n, t } = useTranslation("common");

  return (
    <div className="flex items-center gap-1.5">
      <Languages className="h-4 w-4 text-gray-400" aria-hidden="true" />
      <label className="sr-only" htmlFor="language-select">
        {t("language")}
      </label>
      <select
        id="language-select"
        value={i18n.language}
        onChange={(e) => void changeLanguage(e.target.value as LanguageCode)}
        className="rounded-md border border-gray-200 bg-transparent py-1 ps-2 pe-6 text-sm text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:border-gray-600 dark:text-gray-200"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}
