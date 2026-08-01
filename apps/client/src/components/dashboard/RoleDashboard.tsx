import { Link } from "react-router-dom";
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
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          <p>Could not load your dashboard. {(error as Error)?.message}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 rounded-md border border-red-300 px-3 py-1 font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
          >
            Try again
          </button>
        </div>
      )}

      {data && (
        <>
          {data.kpis.length === 0 ? (
            <EmptyState
              title="No figures yet"
              description="KPIs appear here once there is activity to measure."
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
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">{section.title}</h2>
      {section.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Nothing here right now.</p>
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
        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {item.label}
        </p>
        {subtitle && (
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        )}
      </div>
      {item.meta && (
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          {item.meta}
        </span>
      )}
    </div>
  );

  return item.href ? (
    <Link to={item.href} className="block hover:bg-gray-50 dark:hover:bg-gray-700/50">
      {body}
    </Link>
  ) : (
    body
  );
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value);
}
