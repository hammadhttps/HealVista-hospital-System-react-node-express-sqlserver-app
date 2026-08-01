import { useState } from "react";
import type { AnalyticsOverview } from "@healvista/shared";
import { useAnalyticsOverview } from "../hooks/queries/useDashboard";
import { ChartCard, DataTable, RankBarChart, TrendChart } from "../components/analytics/charts";
import { KpiCard, KpiCardSkeleton } from "../components/dashboard/KpiCard";
import { downloadCsv, toCsv } from "../lib/csv";
import { formatCurrency, formatNumber } from "../lib/format";

/**
 * Operational analytics (Phase 6.2) — ADMIN only.
 *
 * Every figure is aggregated in SQL on the server; this page renders and
 * exports, it never computes. Each chart is a single series, and a table view
 * plus CSV export make every plotted value reachable without relying on colour.
 */

const RANGE_PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Year to date", days: null },
] as const;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function presetRange(days: number | null): { from: string; to: string } {
  const to = new Date();
  const from =
    days === null
      ? new Date(to.getFullYear(), 0, 1)
      : new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: isoDay(from), to: isoDay(to) };
}

export default function AdminAnalytics() {
  const [range, setRange] = useState(() => presetRange(30));
  const [activePreset, setActivePreset] = useState<string | null>("Last 30 days");
  const { data, isPending, isError, error, refetch } = useAnalyticsOverview(range);

  function applyPreset(label: string, days: number | null) {
    setActivePreset(label);
    setRange(presetRange(days));
  }

  function applyCustom(patch: Partial<{ from: string; to: string }>) {
    setActivePreset(null);
    setRange((r) => ({ ...r, ...patch }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Operational Analytics</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {range.from} → {range.to}
          </p>
        </div>
        {data && <ExportButton data={data} range={range} />}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.label, p.days)}
            aria-pressed={activePreset === p.label}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              activePreset === p.label
                ? "border-blue-600 bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-200"
                : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700/50"
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="ms-2 flex items-end gap-2">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            From
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => applyCustom({ from: e.target.value })}
              className="mt-1 block rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
          </label>
          <label className="text-xs text-gray-500 dark:text-gray-400">
            To
            <input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => applyCustom({ to: e.target.value })}
              className="mt-1 block rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
          </label>
        </div>
      </div>

      {isPending && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiCardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          <p>Could not load analytics. {(error as Error)?.message}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 rounded-md border border-red-300 px-3 py-1 font-medium hover:bg-red-100 dark:border-red-800"
          >
            Try again
          </button>
        </div>
      )}

      {data && <Overview data={data} />}
    </div>
  );
}

function Overview({ data }: { data: AnalyticsOverview }) {
  const totalRevenue = data.revenueByDepartment.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard kpi={{ key: "noShow", label: "No-show rate", value: `${data.noShow.rate}%` }} />
        <KpiCard
          kpi={{
            key: "waiting",
            label: "Avg waiting time",
            value: data.avgWaitingTimeMins ?? 0,
            unit: "min",
          }}
        />
        <KpiCard
          kpi={{
            key: "consult",
            label: "Avg consultation",
            value: data.avgConsultationMins ?? 0,
            unit: "min",
          }}
        />
        <KpiCard
          kpi={{
            key: "lead",
            label: "Avg booking lead time",
            value: `${formatNumber(data.avgLeadTimeDays ?? 0)} days`,
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Appointments per day">
          <TrendChart
            data={data.appointmentsPerDay}
            xKey="date"
            yKey="count"
            yLabel="Appointments"
          />
        </ChartCard>

        <ChartCard title="New patient registrations">
          <TrendChart data={data.patientGrowth} xKey="date" yKey="count" yLabel="Patients" />
        </ChartCard>

        <ChartCard title="Appointments by department">
          <RankBarChart
            data={data.appointmentsPerDepartment}
            categoryKey="department"
            valueKey="count"
            valueLabel="Appointments"
          />
        </ChartCard>

        <ChartCard title="Appointments by doctor">
          <RankBarChart
            data={data.appointmentsPerDoctor}
            categoryKey="doctor"
            valueKey="count"
            valueLabel="Appointments"
          />
        </ChartCard>

        <ChartCard
          title="Doctor utilisation"
          subtitle="Booked slots ÷ available slots. Bars below 40% are flagged."
        >
          <RankBarChart
            data={data.doctorUtilisation}
            categoryKey="doctor"
            valueKey="utilisation"
            valueLabel="Utilisation"
            unit="percent"
            highlight={(row) => Number(row.utilisation) < 40}
          />
        </ChartCard>

        <ChartCard title="Cancellation reasons">
          <RankBarChart
            data={data.cancellationReasons}
            categoryKey="reason"
            valueKey="count"
            valueLabel="Cancellations"
          />
        </ChartCard>

        <ChartCard
          title="Revenue by department"
          subtitle={`Total ${formatCurrency(totalRevenue)} in range`}
        >
          <RankBarChart
            data={data.revenueByDepartment}
            categoryKey="department"
            valueKey="amount"
            valueLabel="Revenue"
            unit="currency"
          />
        </ChartCard>

        <ChartCard title="Revenue by payment method">
          <RankBarChart
            data={data.revenueByMethod}
            categoryKey="method"
            valueKey="amount"
            valueLabel="Revenue"
            unit="currency"
          />
        </ChartCard>

        <ChartCard title="Most prescribed medicines">
          <RankBarChart
            data={data.topMedicines}
            categoryKey="medicine"
            valueKey="count"
            valueLabel="Prescribed"
          />
        </ChartCard>

        <ChartCard title="Most ordered lab tests">
          <RankBarChart
            data={data.topLabTests}
            categoryKey="test"
            valueKey="count"
            valueLabel="Ordered"
          />
        </ChartCard>

        <ChartCard title="Top diagnoses">
          <RankBarChart
            data={data.topDiagnoses}
            categoryKey="diagnosis"
            valueKey="count"
            valueLabel="Recorded"
          />
        </ChartCard>

        <ChartCard title="Revenue by month">
          <RankBarChart
            data={data.revenueByMonth}
            categoryKey="month"
            valueKey="amount"
            valueLabel="Revenue"
            unit="currency"
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Low stock" subtitle="At or below reorder level">
          <DataTable
            columns={[
              { key: "medicine", label: "Medicine" },
              { key: "quantity", label: "Qty", align: "right" },
              { key: "reorderLevel", label: "Reorder at", align: "right" },
            ]}
            rows={data.stockLow}
          />
        </ChartCard>

        <ChartCard title="Expiring within 90 days">
          <DataTable
            columns={[
              { key: "medicine", label: "Medicine" },
              { key: "batchNumber", label: "Batch" },
              { key: "expiryDate", label: "Expires", align: "right" },
            ]}
            rows={data.stockExpiring.map((s) => ({
              ...s,
              expiryDate: s.expiryDate ? s.expiryDate.slice(0, 10) : null,
            }))}
          />
        </ChartCard>
      </div>
    </>
  );
}

/**
 * Flattens every section into one CSV so an admin can pivot it elsewhere. Each
 * row carries its section name, which keeps a single file readable.
 */
function ExportButton({
  data,
  range,
}: {
  data: AnalyticsOverview;
  range: { from: string; to: string };
}) {
  function handleExport() {
    const columns = [
      { key: "section", label: "Section" },
      { key: "label", label: "Label" },
      { key: "value", label: "Value" },
    ];

    const rows: Record<string, unknown>[] = [
      { section: "Summary", label: "No-show rate (%)", value: data.noShow.rate },
      { section: "Summary", label: "No-shows", value: data.noShow.noShows },
      { section: "Summary", label: "Appointments in range", value: data.noShow.total },
      { section: "Summary", label: "Avg waiting time (min)", value: data.avgWaitingTimeMins ?? "" },
      {
        section: "Summary",
        label: "Avg consultation (min)",
        value: data.avgConsultationMins ?? "",
      },
      { section: "Summary", label: "Avg booking lead (days)", value: data.avgLeadTimeDays ?? "" },
      ...data.appointmentsPerDay.map((r) => ({
        section: "Appointments per day",
        label: r.date,
        value: r.count,
      })),
      ...data.appointmentsPerDepartment.map((r) => ({
        section: "Appointments by department",
        label: r.department,
        value: r.count,
      })),
      ...data.appointmentsPerDoctor.map((r) => ({
        section: "Appointments by doctor",
        label: r.doctor,
        value: r.count,
      })),
      ...data.cancellationReasons.map((r) => ({
        section: "Cancellation reasons",
        label: r.reason,
        value: r.count,
      })),
      ...data.patientGrowth.map((r) => ({
        section: "Patient growth",
        label: r.date,
        value: r.count,
      })),
      ...data.doctorUtilisation.map((r) => ({
        section: "Doctor utilisation (%)",
        label: r.doctor,
        value: r.utilisation,
      })),
      ...data.revenueByDepartment.map((r) => ({
        section: "Revenue by department",
        label: r.department,
        value: r.amount,
      })),
      ...data.revenueByMethod.map((r) => ({
        section: "Revenue by method",
        label: r.method,
        value: r.amount,
      })),
      ...data.revenueByMonth.map((r) => ({
        section: "Revenue by month",
        label: r.month,
        value: r.amount,
      })),
      ...data.topMedicines.map((r) => ({
        section: "Most prescribed medicines",
        label: r.medicine,
        value: r.count,
      })),
      ...data.topLabTests.map((r) => ({
        section: "Most ordered lab tests",
        label: r.test,
        value: r.count,
      })),
      ...data.topDiagnoses.map((r) => ({
        section: "Top diagnoses",
        label: r.diagnosis,
        value: r.count,
      })),
      ...data.stockLow.map((r) => ({
        section: "Low stock",
        label: r.medicine,
        value: `${r.quantity} (reorder at ${r.reorderLevel})`,
      })),
      ...data.stockExpiring.map((r) => ({
        section: "Expiring within 90 days",
        label: `${r.medicine}${r.batchNumber ? ` — batch ${r.batchNumber}` : ""}`,
        value: r.expiryDate ? r.expiryDate.slice(0, 10) : "",
      })),
    ];

    downloadCsv(`healvista-analytics-${range.from}_${range.to}.csv`, toCsv(columns, rows));
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/50"
    >
      Export CSV
    </button>
  );
}
