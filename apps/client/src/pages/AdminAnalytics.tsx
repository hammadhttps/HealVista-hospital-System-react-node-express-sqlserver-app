import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  { key: "last7", days: 7 },
  { key: "last30", days: 30 },
  { key: "last90", days: 90 },
  { key: "yearToDate", days: null },
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
  const { t } = useTranslation(["analytics", "common"]);
  const [range, setRange] = useState(() => presetRange(30));
  const [activePreset, setActivePreset] = useState<string | null>("last30");
  const { data, isPending, isError, error, refetch } = useAnalyticsOverview(range);

  function applyPreset(key: string, days: number | null) {
    setActivePreset(key);
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
          <h1 className="text-2xl font-bold">{t("analytics:title")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {range.from} → {range.to}
          </p>
        </div>
        {data && <ExportButton data={data} range={range} />}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key, p.days)}
            aria-pressed={activePreset === p.key}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              activePreset === p.key
                ? "border-blue-600 bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-200"
                : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700/50"
            }`}
          >
            {t(`analytics:${p.key}`)}
          </button>
        ))}
        <div className="ms-2 flex items-end gap-2">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            {t("common:from")}
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => applyCustom({ from: e.target.value })}
              className="mt-1 block rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
          </label>
          <label className="text-xs text-gray-500 dark:text-gray-400">
            {t("common:to")}
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
          <p>
            {t("analytics:loadFailed")} {(error as Error)?.message}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 rounded-md border border-red-300 px-3 py-1 font-medium hover:bg-red-100 dark:border-red-800"
          >
            {t("common:tryAgain")}
          </button>
        </div>
      )}

      {data && <Overview data={data} />}
    </div>
  );
}

function Overview({ data }: { data: AnalyticsOverview }) {
  const { t } = useTranslation(["analytics"]);
  const totalRevenue = data.revenueByDepartment.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          kpi={{
            key: "noShow",
            label: t("analytics:noShowRate"),
            value: `${data.noShow.rate}%`,
          }}
        />
        <KpiCard
          kpi={{
            key: "waiting",
            label: t("analytics:avgWaiting"),
            value: data.avgWaitingTimeMins ?? 0,
            unit: "min",
          }}
        />
        <KpiCard
          kpi={{
            key: "consult",
            label: t("analytics:avgConsultation"),
            value: data.avgConsultationMins ?? 0,
            unit: "min",
          }}
        />
        <KpiCard
          kpi={{
            key: "lead",
            label: t("analytics:avgLeadTime"),
            value: `${formatNumber(data.avgLeadTimeDays ?? 0)} ${t("analytics:days")}`,
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title={t("analytics:appointmentsPerDay")}>
          <TrendChart
            data={data.appointmentsPerDay}
            xKey="date"
            yKey="count"
            yLabel={t("analytics:appointments")}
          />
        </ChartCard>

        <ChartCard title={t("analytics:newRegistrations")}>
          <TrendChart
            data={data.patientGrowth}
            xKey="date"
            yKey="count"
            yLabel={t("analytics:patients")}
          />
        </ChartCard>

        <ChartCard title={t("analytics:byDepartment")}>
          <RankBarChart
            data={data.appointmentsPerDepartment}
            categoryKey="department"
            valueKey="count"
            valueLabel={t("analytics:appointments")}
          />
        </ChartCard>

        <ChartCard title={t("analytics:byDoctor")}>
          <RankBarChart
            data={data.appointmentsPerDoctor}
            categoryKey="doctor"
            valueKey="count"
            valueLabel={t("analytics:appointments")}
          />
        </ChartCard>

        <ChartCard title={t("analytics:utilisation")} subtitle={t("analytics:utilisationHint")}>
          <RankBarChart
            data={data.doctorUtilisation}
            categoryKey="doctor"
            valueKey="utilisation"
            valueLabel={t("analytics:utilisationShort")}
            unit="percent"
            highlight={(row) => Number(row.utilisation) < 40}
          />
        </ChartCard>

        <ChartCard title={t("analytics:cancellationReasons")}>
          <RankBarChart
            data={data.cancellationReasons}
            categoryKey="reason"
            valueKey="count"
            valueLabel={t("analytics:cancellations")}
          />
        </ChartCard>

        <ChartCard
          title={t("analytics:revenueByDepartment")}
          subtitle={t("analytics:totalInRange", { amount: formatCurrency(totalRevenue) })}
        >
          <RankBarChart
            data={data.revenueByDepartment}
            categoryKey="department"
            valueKey="amount"
            valueLabel={t("analytics:revenue")}
            unit="currency"
          />
        </ChartCard>

        <ChartCard title={t("analytics:revenueByMethod")}>
          <RankBarChart
            data={data.revenueByMethod}
            categoryKey="method"
            valueKey="amount"
            valueLabel={t("analytics:revenue")}
            unit="currency"
          />
        </ChartCard>

        <ChartCard title={t("analytics:topMedicines")}>
          <RankBarChart
            data={data.topMedicines}
            categoryKey="medicine"
            valueKey="count"
            valueLabel={t("analytics:prescribed")}
          />
        </ChartCard>

        <ChartCard title={t("analytics:topLabTests")}>
          <RankBarChart
            data={data.topLabTests}
            categoryKey="test"
            valueKey="count"
            valueLabel={t("analytics:ordered")}
          />
        </ChartCard>

        <ChartCard title={t("analytics:topDiagnoses")}>
          <RankBarChart
            data={data.topDiagnoses}
            categoryKey="diagnosis"
            valueKey="count"
            valueLabel={t("analytics:recorded")}
          />
        </ChartCard>

        <ChartCard title={t("analytics:revenueByMonth")}>
          <RankBarChart
            data={data.revenueByMonth}
            categoryKey="month"
            valueKey="amount"
            valueLabel={t("analytics:revenue")}
            unit="currency"
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title={t("analytics:lowStock")} subtitle={t("analytics:lowStockHint")}>
          <DataTable
            columns={[
              { key: "medicine", label: t("analytics:medicine") },
              { key: "quantity", label: t("analytics:quantity"), align: "right" },
              { key: "reorderLevel", label: t("analytics:reorderAt"), align: "right" },
            ]}
            rows={data.stockLow}
          />
        </ChartCard>

        <ChartCard title={t("analytics:expiringSoon")}>
          <DataTable
            columns={[
              { key: "medicine", label: t("analytics:medicine") },
              { key: "batchNumber", label: t("analytics:batch") },
              { key: "expiryDate", label: t("analytics:expires"), align: "right" },
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
  const { t } = useTranslation(["analytics", "common"]);

  function handleExport() {
    const columns = [
      { key: "section", label: t("analytics:csvSection") },
      { key: "label", label: t("analytics:csvLabel") },
      { key: "value", label: t("analytics:csvValue") },
    ];

    const rows: Record<string, unknown>[] = [
      {
        section: t("analytics:csvSummary"),
        label: t("analytics:csvNoShowRate"),
        value: data.noShow.rate,
      },
      {
        section: t("analytics:csvSummary"),
        label: t("analytics:csvNoShows"),
        value: data.noShow.noShows,
      },
      {
        section: t("analytics:csvSummary"),
        label: t("analytics:csvAppointmentsInRange"),
        value: data.noShow.total,
      },
      {
        section: t("analytics:csvSummary"),
        label: t("analytics:csvAvgWaiting"),
        value: data.avgWaitingTimeMins ?? "",
      },
      {
        section: t("analytics:csvSummary"),
        label: t("analytics:csvAvgConsultation"),
        value: data.avgConsultationMins ?? "",
      },
      {
        section: t("analytics:csvSummary"),
        label: t("analytics:csvAvgLead"),
        value: data.avgLeadTimeDays ?? "",
      },
      ...data.appointmentsPerDay.map((r) => ({
        section: t("analytics:appointmentsPerDay"),
        label: r.date,
        value: r.count,
      })),
      ...data.appointmentsPerDepartment.map((r) => ({
        section: t("analytics:byDepartment"),
        label: r.department,
        value: r.count,
      })),
      ...data.appointmentsPerDoctor.map((r) => ({
        section: t("analytics:byDoctor"),
        label: r.doctor,
        value: r.count,
      })),
      ...data.cancellationReasons.map((r) => ({
        section: t("analytics:cancellationReasons"),
        label: r.reason,
        value: r.count,
      })),
      ...data.patientGrowth.map((r) => ({
        section: t("analytics:csvPatientGrowth"),
        label: r.date,
        value: r.count,
      })),
      ...data.doctorUtilisation.map((r) => ({
        section: t("analytics:csvDoctorUtilisation"),
        label: r.doctor,
        value: r.utilisation,
      })),
      ...data.revenueByDepartment.map((r) => ({
        section: t("analytics:revenueByDepartment"),
        label: r.department,
        value: r.amount,
      })),
      ...data.revenueByMethod.map((r) => ({
        section: t("analytics:csvRevenueByMethod"),
        label: r.method,
        value: r.amount,
      })),
      ...data.revenueByMonth.map((r) => ({
        section: t("analytics:revenueByMonth"),
        label: r.month,
        value: r.amount,
      })),
      ...data.topMedicines.map((r) => ({
        section: t("analytics:topMedicines"),
        label: r.medicine,
        value: r.count,
      })),
      ...data.topLabTests.map((r) => ({
        section: t("analytics:topLabTests"),
        label: r.test,
        value: r.count,
      })),
      ...data.topDiagnoses.map((r) => ({
        section: t("analytics:topDiagnoses"),
        label: r.diagnosis,
        value: r.count,
      })),
      ...data.stockLow.map((r) => ({
        section: t("analytics:lowStock"),
        label: r.medicine,
        value: t("analytics:csvLowStockValue", { quantity: r.quantity, level: r.reorderLevel }),
      })),
      ...data.stockExpiring.map((r) => ({
        section: t("analytics:expiringSoon"),
        label: `${r.medicine}${r.batchNumber ? t("analytics:csvBatchSuffix", { batch: r.batchNumber }) : ""}`,
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
      {t("common:exportCsv")}
    </button>
  );
}
