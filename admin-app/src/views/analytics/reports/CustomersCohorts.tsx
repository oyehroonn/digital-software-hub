/**
 * Customers — Cohort retention report.
 *
 * Longitudinal retention grid: rows are acquisition months (the calendar month
 * of each customer's FIRST order, grouped by email), columns are months-since-
 * acquisition, cells are the % of the cohort that ordered again that month.
 * Cells beyond the observable window (as-of the selected range end) stay blank,
 * never zero. Also renders the blended average retention curve.
 *
 * Consumes the GLOBAL date-range + compare context (`useDateRange`): the range
 * END sets the observation horizon and how many cohorts are shown, so moving the
 * shared toolbar range re-computes the grid. The sequential single-hue heatmap
 * follows the dataviz method (one hue light→dark for magnitude, value printed in
 * every cell so it never relies on colour alone).
 */
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Grid3x3, LineChart as LineChartIcon, Users } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { Empty } from "@/components/Empty";
import { useAnalyticsData } from "../useAnalyticsData";
import { useDateRange } from "./dateRange";
import { AXIS, GRID, TOOLTIP, PALETTE, KpiCard, ChartCard, ReportHeader } from "./reportKit";
import { buildIndex, cohortRetention } from "./customerMetrics";

const RETAIN_HUE = PALETTE.ok; // green — sequential magnitude

/** Sequential green cell: alpha grows with retention, text flips when strong. */
function cellStyle(v: number | null): { background: string; color: string } {
  if (v == null) return { background: "transparent", color: "transparent" };
  const alpha = 0.1 + v * 0.85;
  return {
    background: `color-mix(in srgb, ${RETAIN_HUE} ${Math.round(alpha * 100)}%, transparent)`,
    color: v >= 0.45 ? "#0b120e" : "#cfd3d6",
  };
}

export function CustomersCohorts({ config }: { config: AppConfig }) {
  const { orders, seeded, loading, liveCount, refresh } = useAnalyticsData(config);
  const r = useDateRange();

  const win = useMemo(() => ({ start: r.start, end: r.end }), [r.start, r.end]);
  const idx = useMemo(() => buildIndex(orders), [orders]);
  const grid = useMemo(() => cohortRetention(orders, idx, win, 12), [orders, idx, win]);

  const cols = useMemo(() => Array.from({ length: grid.maxOffset + 1 }, (_, i) => i), [grid.maxOffset]);
  const totalCohortCustomers = grid.rows.reduce((s, r2) => s + r2.size, 0);
  const month1 = grid.average[1];
  const month3 = grid.average[3];
  const month6 = grid.average[6];
  const pctOrDash = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

  const avgCurve = grid.average
    .map((v, i) => (v == null ? null : { offset: `M${i}`, rate: v }))
    .filter(Boolean) as { offset: string; rate: number }[];

  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        icon={<Grid3x3 className="h-4 w-4 text-primary" />}
        title="Customers — Cohort retention"
        subtitle="Each row is the month customers were acquired (first order); each column is months since. Cells show the share of that cohort who ordered again. Blank cells haven't happened yet as of the selected range end."
        seeded={seeded}
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {grid.rows.length === 0 ? (
        <Empty
          icon={<Grid3x3 className="h-8 w-8" />}
          title="Not enough history for cohorts"
          hint="Cohort retention needs orders spanning at least two months with repeat purchases. Widen the range or wait for more order history."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Cohorts shown" value={grid.rows.length.toLocaleString("en-US")} sub={`${totalCohortCustomers.toLocaleString("en-US")} customers`} color={PALETTE.primary} />
            <KpiCard label="Month-1 retention" value={pctOrDash(month1)} sub="blended across cohorts" color={PALETTE.primary} />
            <KpiCard label="Month-3 retention" value={pctOrDash(month3)} sub="blended across cohorts" color={PALETTE.ok} />
            <KpiCard label="Month-6 retention" value={pctOrDash(month6)} sub="blended across cohorts" color={PALETTE.violet} />
          </div>

          {/* Retention heatmap */}
          <ChartCard
            title={
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Retention by acquisition month
              </span>
            }
            right={
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>Low</span>
                <span className="h-2.5 w-24 rounded" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${RETAIN_HUE} 10%, transparent), ${RETAIN_HUE})` }} />
                <span>High</span>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-card px-2 py-1 text-left text-[11px] font-medium text-muted-foreground">Cohort</th>
                    <th className="px-2 py-1 text-right text-[11px] font-medium text-muted-foreground">Size</th>
                    {cols.map((c) => (
                      <th key={c} className="min-w-[46px] px-1 py-1 text-center text-[11px] font-medium text-muted-foreground">
                        M{c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row) => (
                    <tr key={row.monthKey}>
                      <td className="sticky left-0 z-10 bg-card px-2 py-1 text-left text-xs font-medium text-foreground">{row.label}</td>
                      <td className="px-2 py-1 text-right text-xs tabular-nums text-muted-foreground">{row.size.toLocaleString("en-US")}</td>
                      {cols.map((c) => {
                        const v = row.retained[c] ?? null;
                        const st = cellStyle(v);
                        return (
                          <td
                            key={c}
                            className="rounded px-1 py-1 text-center text-[11px] tabular-nums"
                            style={{ background: st.background, color: st.color }}
                            title={v == null ? "" : `${row.label} · M${c}: ${(v * 100).toFixed(1)}% retained`}
                          >
                            {v == null ? "" : `${Math.round(v * 100)}%`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          {/* Blended average retention curve */}
          <ChartCard
            title={
              <span className="flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-primary" /> Average retention curve
              </span>
            }
          >
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={avgCurve} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="c-retain" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={RETAIN_HUE} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={RETAIN_HUE} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="offset" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                  <Tooltip {...TOOLTIP} cursor={{ stroke: GRID }} formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, "Retained"]} />
                  <Area type="monotone" dataKey="rate" name="Retained" stroke={RETAIN_HUE} strokeWidth={2} fill="url(#c-retain)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}
