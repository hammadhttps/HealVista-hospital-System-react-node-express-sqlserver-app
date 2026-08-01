import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import ur from "./locales/ur";

/**
 * Internationalisation (Phase 6.7) — English and Urdu.
 *
 * Resources are namespaced per feature so a screen only pulls the strings it
 * needs, and so two features can use the same key ("title", "empty") without
 * colliding.
 *
 * Urdu is right-to-left. The `dir` attribute is set from the active language in
 * `useDirection`, and layout uses Tailwind's logical properties (`ms-`/`me-`,
 * `ps-`/`pe-`, `text-start`/`text-end`) so mirroring is automatic rather than a
 * second set of styles.
 *
 * Dates, numbers and currency are **not** translated here — they go through
 * `lib/format.ts`, which uses `Intl` with the active locale.
 */

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ur", label: "اردو", dir: "rtl" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

const STORAGE_KEY = "healvista-language";

export function storedLanguage(): LanguageCode {
  if (typeof localStorage === "undefined") return "en";
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "ur" || saved === "en" ? saved : "en";
}

export function directionFor(code: string): "ltr" | "rtl" {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.dir ?? "ltr";
}

/**
 * Applies the language to the document.
 *
 * `lang` drives `Intl` formatting and screen-reader pronunciation; `dir` flips
 * the whole layout. Both belong on `<html>`, not on a React wrapper, so native
 * elements (scrollbars, form controls, selection) mirror too.
 */
export function applyDocumentLanguage(code: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = code;
  document.documentElement.dir = directionFor(code);
}

export async function changeLanguage(code: LanguageCode): Promise<void> {
  localStorage.setItem(STORAGE_KEY, code);
  await i18n.changeLanguage(code);
  applyDocumentLanguage(code);
}

const initial = storedLanguage();

void i18n.use(initReactI18next).init({
  resources: { en, ur },
  lng: initial,
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: {
    // React already escapes rendered values; escaping again double-encodes.
    escapeValue: false,
  },
  returnEmptyString: false,
});

applyDocumentLanguage(initial);

export default i18n;
