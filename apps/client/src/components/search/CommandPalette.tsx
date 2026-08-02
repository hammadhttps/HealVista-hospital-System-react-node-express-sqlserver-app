import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, Star, X } from "lucide-react";
import { SEARCH_MIN_LENGTH, type SearchResult } from "@healvista/shared";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useGlobalSearch, useSavedSearches, useSearchHistory } from "../../hooks/queries/useSearch";
import { useSaveSearch } from "../../hooks/mutations/useSearchMutations";

/**
 * Global search command palette (Phase 6.3), opened with Cmd/Ctrl + K.
 *
 * Results are grouped by entity type with a badge, and the whole list is
 * keyboard navigable: ↑/↓ move through a flattened index of every result across
 * groups, Enter opens the highlighted one, Escape closes. Input is debounced and
 * only queries at the shared minimum length.
 *
 * What comes back is decided entirely by the server from the caller's role, so
 * there is no visibility logic here.
 */

const TYPE_BADGES: Record<string, string> = {
  patient: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  doctor: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  appointment: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  medicine: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  labOrder: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
  invoice: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [term, setTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const debounced = useDebouncedValue(term, 250);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation(["search", "a11y"]);

  const { data, isFetching } = useGlobalSearch(debounced, open);
  const { data: history } = useSearchHistory(open);
  const { data: saved } = useSavedSearches(open);
  const saveSearch = useSaveSearch();

  const showSuggestions = debounced.trim().length < SEARCH_MIN_LENGTH;

  /** Every result across groups, in render order — what ↑/↓ walks. */
  const flat = useMemo(() => (data?.groups ?? []).flatMap((g) => g.results), [data]);

  // Focus the input each time the palette opens. Imperative DOM work, not fetching.
  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      inputRef.current?.focus();
    } else {
      setTerm("");
    }
  }, [open]);

  useEffect(() => setActiveIndex(0), [debounced]);

  // Keep the highlighted row in view as the selection moves by keyboard.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const openResult = useCallback(
    (result: SearchResult) => {
      onClose();
      navigate(result.href);
    },
    [navigate, onClose],
  );

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (flat.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = flat[activeIndex];
      if (result) openResult(result);
    }
  }

  if (!open) return null;

  let renderIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("a11y:openSearch")}
        className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-700">
          <Search className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("search:placeholder")}
            aria-label={t("a11y:openSearch")}
            aria-controls="command-palette-results"
            aria-activedescendant={flat.length > 0 ? `search-result-${activeIndex}` : undefined}
            className="w-full bg-transparent py-4 text-base outline-none placeholder:text-gray-400 dark:text-gray-100"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm("")}
              aria-label={t("a11y:clearSearch")}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div
          id="command-palette-results"
          ref={listRef}
          role="listbox"
          aria-label={t("a11y:searchResults")}
          className="max-h-[60vh] overflow-y-auto p-2"
        >
          {showSuggestions ? (
            <Suggestions
              history={history ?? []}
              saved={saved ?? []}
              onPick={(q) => setTerm(q)}
              t={t}
            />
          ) : isFetching && !data ? (
            <p className="px-3 py-8 text-center text-sm text-gray-500">{t("search:searching")}</p>
          ) : flat.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-gray-500">
              {t("search:noMatches", { query: debounced })}
            </p>
          ) : (
            <>
              {(data?.groups ?? []).map((group) => (
                <section key={group.type} className="mb-2">
                  <h2 className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-400">
                    {group.label}
                  </h2>
                  <ul>
                    {group.results.map((result) => {
                      renderIndex += 1;
                      const index = renderIndex;
                      return (
                        <li key={`${result.type}-${result.id}`}>
                          <button
                            type="button"
                            id={`search-result-${index}`}
                            data-index={index}
                            role="option"
                            aria-selected={index === activeIndex}
                            onClick={() => openResult(result)}
                            onMouseEnter={() => setActiveIndex(index)}
                            className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-start ${
                              index === activeIndex
                                ? "bg-blue-50 dark:bg-gray-700"
                                : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                {result.title}
                              </span>
                              {result.subtitle && (
                                <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                                  {result.subtitle}
                                </span>
                              )}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              {result.meta && (
                                <span className="text-xs text-gray-500">{result.meta}</span>
                              )}
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs ${
                                  TYPE_BADGES[result.type] ?? "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {group.label.replace(/s$/, "")}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-gray-700">
          <span>{t("search:hint")}</span>
          {debounced.trim().length >= SEARCH_MIN_LENGTH && (
            <button
              type="button"
              onClick={() => saveSearch.mutate({ query: debounced.trim() })}
              disabled={saveSearch.isPending}
              className="flex items-center gap-1 rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-700"
            >
              <Star className="h-3 w-3" aria-hidden="true" />
              {t("search:saveThis")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Suggestions({
  history,
  saved,
  onPick,
  t,
}: {
  history: { id: string; query: string }[];
  saved: { id: string; query: string; label: string | null }[];
  onPick: (query: string) => void;
  t: ReturnType<typeof useTranslation<["search", "a11y"]>>["t"];
}) {
  if (history.length === 0 && saved.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-gray-500">
        {t("search:minChars", { count: SEARCH_MIN_LENGTH })}
      </p>
    );
  }

  return (
    <>
      {saved.length > 0 && (
        <SuggestionGroup title={t("search:saved")} items={saved} onPick={onPick} />
      )}
      {history.length > 0 && (
        <SuggestionGroup title={t("search:recent")} items={history} onPick={onPick} />
      )}
    </>
  );
}

function SuggestionGroup({
  title,
  items,
  onPick,
}: {
  title: string;
  items: { id: string; query: string; label?: string | null }[];
  onPick: (query: string) => void;
}) {
  return (
    <section className="mb-2">
      <h2 className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-400">
        {title}
      </h2>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onPick(item.query)}
              className="w-full rounded-md px-3 py-2 text-start text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/50"
            >
              {item.label || item.query}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
