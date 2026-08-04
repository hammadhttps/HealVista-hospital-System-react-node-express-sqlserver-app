import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { DashboardSection } from "@healvista/shared";
import { useDashboard } from "../../hooks/queries/useDashboard";
import { EmptyState } from "../primitives/EmptyState";
import { KpiCard, KpiCardSkeleton } from "./KpiCard";
import { formatDateTime } from "../../lib/format";

/**
 * The role-filtered KPI set (Phase 6.1).
 *
 * One component for all seven roles — the server decides which numbers the
 * caller is entitled to, so there is no role branching here. `children` lets a
 * role's page add surfaces the generic set doesn't cover (an AI assistant, a
 * queue widget) below the KPIs.
 */
export function RoleDashboard({ title, children }: { title: string; children?: React.ReactNode }) {
  const { data, isPending, isError, error, refetch } = useDashboard();
  const { t } = useTranslation(["dashboard", "common"]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{title}</h1>

      {isPending && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <KpiCardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <p>
            {t("dashboard:loadFailed")} {(error as Error)?.message}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 rounded-md border border-destructive/40 px-3 py-1 font-medium hover:bg-destructive/10"
          >
            {t("common:tryAgain")}
          </button>
        </div>
      )}

      {data && (
        <>
          {data.kpis.length === 0 ? (
            <EmptyState
              title={t("dashboard:noFigures")}
              description={t("dashboard:noFiguresHint")}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.kpis.map((k) => (
                <KpiCard key={k.key} kpi={k} />
              ))}
            </div>
          )}

          {data.sections.length > 0 && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {data.sections.map((s) => (
                <SectionList key={s.title} section={s} />
              ))}
            </div>
          )}

          {children}
        </>
      )}
    </div>
  );
}

function SectionList({ section }: { section: DashboardSection }) {
  const { t } = useTranslation("common");

  // Some sections are sent as i18n keys (e.g. `dashboard:recentPatients`); the
  // legacy ones still arrive as plain English until they are migrated.
  const title = isI18nKey(section.title) ? t(section.title) : section.title;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
      {section.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground/70">{t("nothingHere")}</p>
      ) : (
        <ul className="space-y-1">
          {section.items.map((item) => (
            <li key={item.id}>
              <ItemRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Subtitles carry ISO timestamps from the server; render them in the user's locale. */
function ItemRow({ item }: { item: DashboardSection["items"][number] }) {
  const subtitle =
    item.subtitle && isIsoDate(item.subtitle) ? formatDateTime(item.subtitle) : item.subtitle;

  const body = (
    <div className="flex items-center justify-between gap-3 rounded-md px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-card-foreground">{item.label}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {item.meta && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {item.meta}
        </span>
      )}
    </div>
  );

  return item.href ? (
    <Link to={item.href} className="block hover:bg-accent/60 rounded-md">
      {body}
    </Link>
  ) : (
    body
  );
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value);
}

/** `namespace:key` — sent as a key when the server can't assume a language. */
function isI18nKey(value: string): boolean {
  return /^[a-z]+:[a-zA-Z0-9]+$/.test(value);
}
