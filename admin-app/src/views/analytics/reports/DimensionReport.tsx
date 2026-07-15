/**
 * DimensionReport — the reusable "sales by X" report body (KPIs + graph + table)
 * that Sales-by-product / SKU / channel / location / referrer all wrap. Callers
 * pass the key/label functions and a chart style; the range/compare scoping,
 * deltas and table come from the shared kit.
 */
import { type ReactNode, useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DollarSign, Layers, ShoppingBag, Trophy } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fmtMoney } from "@/lib/utils";
import { Empty } from "@/components/Empty";
import { useSalesScope } from "./salesScope";
import {
  AXIS,
  ChartCard,
  deltaOf,
  fmtNum,
  GRID,
  KpiCard,
  PALETTE,
  ReportHeader,
  SERIES_COLORS,
  TOOLTIP,
} from "./reportKit";
import { DimTable, type ExtraCol } from "./salesTable";
import { groupDimension, summarize, type DimRow } from "./salesData";
import type { Order } from "@/lib/ecommerce";

export interface DimensionReportProps {
  config: AppConfig;
  icon?: ReactNode;
  title: string;
  subtitle: string;
  labelHeader: string;
  /** noun for the "distinct N" and "top" KPIs, e.g. "products" / "channels" */
  noun: string;
  keyFn: (o: Order) => string;
  labelFn?: (o: Order) => string;
  filter?: (o: Order) => boolean;
  chart?: "bar" | "donut";
  topN?: number;
  extraCols?: ExtraCol[];
  emptyHint?: string;
}

export function DimensionReport({
  config,
  icon = <Layers className="h-5 w-5 text-primary" />,
  title,
  subtitle,
  labelHeader,
  noun,
  keyFn,
  labelFn,
  filter,
  chart = "bar",
  topN = 12,
  extraCols,
  emptyHint,
}: DimensionReportProps) {
  const { cur, prev, range, currency, seeded, loading, liveCount, refresh } = useSalesScope(config);

  const rows = useMemo(
    () => groupDimension(cur, range.compareEnabled ? prev : null, keyFn, labelFn ?? keyFn, filter),
    [cur, prev, range.compareEnabled, keyFn, labelFn, filter],
  );
  const tCur = useMemo(() => summarize(filter ? cur.filter(filter) : cur), [cur, filter]);
  const tPrev = useMemo(() => summarize(filter ? prev.filter(filter) : prev), [prev, filter]);

  const money = (v: number) => fmtMoney(v, currency);
  const top = rows[0];
  const hasData = rows.length > 0;

  const chartRows = useMemo(() => {
    const positive = rows.filter((r) => r.net > 0);
    if (chart === "donut") {
      const head = positive.slice(0, topN);
      const rest = positive.slice(topN);
      const otherNet = rest.reduce((a, r) => a + r.net, 0);
      const data = head.map((r) => ({ label: r.label, net: r.net }));
      if (otherNet > 0) data.push({ label: `Other (${rest.length})`, net: otherNet });
      return data;
    }
    return positive.slice(0, topN).map((r) => ({ label: r.label, net: r.net }));
  }, [rows, chart, topN]);

  return (
    <ReportHeader
      icon={icon}
      title={title}
      subtitle={subtitle}
      seeded={seeded}
      loading={loading}
      liveCount={liveCount}
      onRefresh={refresh}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Net sales"
            value={money(tCur.net)}
            icon={<DollarSign className="h-3.5 w-3.5" />}
            color={PALETTE.revenue}
            delta={deltaOf(tCur.net, tPrev.net)}
          />
          <KpiCard label={`Distinct ${noun}`} value={fmtNum(rows.length)} icon={<Layers className="h-3.5 w-3.5" />} color={PALETTE.primary} />
          <KpiCard
            label={`Top ${noun.replace(/s$/, "")}`}
            value={top ? money(top.net) : "—"}
            icon={<Trophy className="h-3.5 w-3.5" />}
            color={PALETTE.amber}
            sub={top ? top.label : "no data"}
          />
          <KpiCard
            label="Orders"
            value={fmtNum(tCur.orders)}
            icon={<ShoppingBag className="h-3.5 w-3.5" />}
            color={PALETTE.ok}
            delta={deltaOf(tCur.orders, tPrev.orders)}
          />
        </div>

        <ChartCard
          title={`Net sales by ${labelHeader.toLowerCase()}`}
          desc={chart === "donut" ? "Share of net sales across the selected range." : `Top ${topN} by net sales in the selected range.`}
        >
          {!hasData ? (
            <Empty icon={icon} title="No sales in this range" hint={emptyHint} />
          ) : chart === "donut" ? (
            <DonutChart data={chartRows} money={money} />
          ) : (
            <BarRanking data={chartRows} money={money} />
          )}
        </ChartCard>

        <ChartCard title={`${labelHeader} breakdown`} desc="Full ranking with vs-previous deltas.">
          {!hasData ? (
            <Empty title="Nothing to break down yet" hint={emptyHint} />
          ) : (
            <DimTable rows={rows} labelHeader={labelHeader} currency={currency} extraCols={extraCols} />
          )}
        </ChartCard>
      </div>
    </ReportHeader>
  );
}

function BarRanking({
  data,
  money,
}: {
  data: { label: string; net: number }[];
  money: (v: number) => string;
}) {
  const height = Math.max(200, data.length * 34 + 24);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={fmtNum} />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ ...AXIS, width: 140 }}
            tickLine={false}
            axisLine={false}
            width={150}
          />
          <Tooltip {...TOOLTIP} cursor={{ fill: "hsl(220 6% 14%)" }} formatter={(v: number) => [money(v), "Net sales"]} />
          <Bar dataKey="net" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutChart({
  data,
  money,
}: {
  data: { label: string; net: number }[];
  money: (v: number) => string;
}) {
  const total = data.reduce((a, d) => a + d.net, 0) || 1;
  return (
    <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="net" nameKey="label" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="none">
              {data.map((_, i) => (
                <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip {...TOOLTIP} formatter={(v: number) => [money(v), "Net sales"]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1.5">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate text-foreground" title={d.label}>
              {d.label}
            </span>
            <span className="tabular-nums text-muted-foreground">{((d.net / total) * 100).toFixed(1)}%</span>
            <span className="w-20 text-right font-medium tabular-nums text-foreground">{money(d.net)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
