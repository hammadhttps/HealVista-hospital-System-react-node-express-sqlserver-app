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
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{kpi.label}</p>
      <p className="mt-1 text-3xl font-semibold text-card-foreground">{formatKpiValue(kpi)}</p>
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
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-8 w-16 animate-pulse rounded bg-muted" />
    </div>
  );
}
