import type { DashboardKpi } from "@healvista/shared";
import { formatCurrency, formatNumber } from "../../lib/format";

/**
 * A stat tile: label in sentence case, value in semibold sans.
 *
 * Values arrive pre-aggregated from the server — this component formats, it
 * never computes. Large standalone numbers keep the font's proportional
 * figures; `tabular-nums` is reserved for columns that must align vertically.
 */
export function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-sm text-gray-500 dark:text-gray-400">{kpi.label}</p>
      <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-gray-50">
        {formatKpiValue(kpi)}
      </p>
    </div>
  );
}

function formatKpiValue(kpi: DashboardKpi): string {
  if (typeof kpi.value === "string") return kpi.value;
  if (kpi.unit === "currency") return formatCurrency(kpi.value);
  if (kpi.unit === "min") return `${formatNumber(kpi.value)} min`;
  return formatNumber(kpi.value);
}

export function KpiCardSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-2 h-8 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}
