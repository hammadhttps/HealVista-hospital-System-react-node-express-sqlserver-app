import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import { formatCompact, formatCurrency, formatDayTick, formatNumber } from "../../lib/format";

/**
 * Chart primitives for the operational analytics page (Phase 6.2).
 *
 * Every chart here plots a **single series**, so colour carries magnitude, not
 * identity: one hue (`--viz-series-1`) throughout, and no legend box — the card
 * title already names what is plotted. Marks follow the fixed specs: bars capped
 * at 24px with a 4px rounded data-end, 2px lines, and hairline solid gridlines
 * that stay recessive.
 *
 * Axis and label text wears text tokens, never the series colour. Values the
 * charts don't label directly are always reachable through the table view and
 * the CSV export on the page — the relief the palette's contrast warning
 * requires.
 */

const SERIES = "var(--viz-series-1)";
const GRID = "var(--viz-grid)";
const AXIS = "var(--viz-axis)";
const MUTED = "var(--viz-muted)";

const axisTick = { fill: MUTED, fontSize: 12 };

/** Shared tooltip. Recharts' default inherits none of our tokens, so style it. */
const tooltipStyle = {
  contentStyle: {
    borderRadius: 8,
    border: "1px solid var(--viz-grid)",
    background: "var(--color-card, #fff)",
    color: "var(--color-card-foreground, #111)",
    fontSize: 12,
  },
  cursor: { fill: "rgba(127,127,127,0.08)" },
};

export function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function NoData({ label }: { label?: string }) {
  const { t } = useTranslation(["analytics"]);
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-gray-400">
      {label ?? t("analytics:noDataInRange")}
    </div>
  );
}

/** Trend over time — one series, so a line with no legend. */
export function TrendChart({
  data,
  xKey,
  yKey,
  yLabel,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  yKey: string;
  yLabel: string;
}) {
  if (data.length === 0) return <NoData />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={axisTick}
          tickLine={false}
          axisLine={{ stroke: AXIS }}
          tickFormatter={(v: string) => formatDayTick(v)}
          minTickGap={24}
        />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v: number) => formatCompact(v)}
          allowDecimals={false}
        />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={(v) => formatDayTick(String(v))}
          formatter={(v) => [formatNumber(Number(v)), yLabel] as [string, string]}
        />
        <Line
          type="monotone"
          dataKey={yKey}
          stroke={SERIES}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={{ r: 0 }}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-card, #fff)" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Ranked magnitude — horizontal bars so long category names stay readable.
 * `highlight` puts the emphasis hue on rows that breach a threshold (low stock,
 * poor utilisation) and greys the rest; identity never rides on colour alone
 * because every row is labelled on its own axis.
 */
export function RankBarChart({
  data,
  categoryKey,
  valueKey,
  valueLabel,
  unit,
  highlight,
}: {
  data: Record<string, string | number>[];
  categoryKey: string;
  valueKey: string;
  valueLabel: string;
  unit?: "currency" | "percent";
  highlight?: (row: Record<string, string | number>) => boolean;
}) {
  if (data.length === 0) return <NoData />;

  const height = Math.max(180, data.length * 34 + 40);
  const format = (v: number) => {
    if (unit === "percent") return `${formatNumber(v)}%`;
    if (unit === "currency") return formatCurrency(v);
    return formatNumber(v);
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 48, bottom: 4, left: 8 }}
        barCategoryGap={6}
      >
        <CartesianGrid stroke={GRID} strokeWidth={1} horizontal={false} />
        <XAxis
          type="number"
          tick={axisTick}
          tickLine={false}
          axisLine={{ stroke: AXIS }}
          tickFormatter={(v: number) => formatCompact(v)}
        />
        <YAxis
          type="category"
          dataKey={categoryKey}
          tick={axisTick}
          tickLine={false}
          axisLine={{ stroke: AXIS }}
          width={130}
          interval={0}
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(v) => [format(Number(v)), valueLabel] as [string, string]}
        />
        <Bar dataKey={valueKey} barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((row, i) => (
            <Cell key={i} fill={highlight && highlight(row) ? "var(--viz-critical)" : SERIES} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** The table view — the accessible path to every value a chart doesn't label. */
export function DataTable({
  columns,
  rows,
}: {
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, string | number | null>[];
}) {
  const { t } = useTranslation(["analytics"]);
  if (rows.length === 0) return <NoData label={t("analytics:nothingToShow")} />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`py-2 pe-4 font-medium text-gray-500 dark:text-gray-400 ${
                  c.align === "right" ? "text-end" : "text-start"
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-0 dark:border-gray-700/50">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`py-2 pe-4 text-gray-900 dark:text-gray-100 ${
                    c.align === "right" ? "text-end tabular-nums" : "text-start"
                  }`}
                >
                  {row[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
