/**
 * Locale-aware formatting via `Intl` (Phase 6.7).
 *
 * Every user-facing date, number, and currency goes through these helpers so a
 * language switch (English ⇄ Urdu) reformats them without touching components.
 * The locale is read from i18next at call time once that lands; until then it
 * follows the document language, falling back to the browser's.
 */

function currentLocale(): string {
  if (typeof document !== "undefined" && document.documentElement.lang) {
    return document.documentElement.lang;
  }
  return typeof navigator !== "undefined" ? navigator.language : "en";
}

/** The hospital's configured currency. Overridden from settings where available. */
const DEFAULT_CURRENCY = "USD";

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(currentLocale(), options).format(value);
}

export function formatCurrency(value: number, currency = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat(currentLocale(), {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Compact form for chart axes and tight tiles — 12.9K, 4.2M. */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat(currentLocale(), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return new Intl.NumberFormat(currentLocale(), {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value / 100);
}

export function formatDate(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(
    currentLocale(),
    options ?? { year: "numeric", month: "short", day: "numeric" },
  ).format(date);
}

export function formatDateTime(value: string | Date): string {
  return formatDate(value, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Short axis-tick date — "12 Mar". */
export function formatDayTick(value: string): string {
  return formatDate(value, { month: "short", day: "numeric" });
}
