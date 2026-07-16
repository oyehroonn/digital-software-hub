/**
 * Sales over time — net sales, orders, units and AOV across the globally
 * selected date range, with the previous period overlaid for comparison and a
 * per-bucket breakdown table. Graph + table, both driven by the shared
 * date-range/compare context.
 */
import { useMemo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarClock, DollarSign, Package, Receipt, ShoppingBag } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fmtMoney } from "@/lib/utils";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { useAnalyticsData } from "../useAnalyticsData";
import { useDateRange } from "./dateRange";
import {
  AXIS,
  buildBuckets,
  ChartCard,
  CompareLegend,
  deltaOf,
  fmtNum,
  GRID,
  KpiCard,
  PALETTE,
  ReportEmpty,
  ReportHeader,
  TOOLTIP,
} from "./reportKit";
import { buildSalesSeries, currencyOf, scopeStart, summarize, tsOf } from "./salesData";

export function SalesOverTime({ config }: { config: AppConfig }) {
  const { orders, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config);
  const range = useDateRange();

  const cur = useMemo(() => orders.filter((o) => range.inRange(tsOf(o))), [orders, range]);
  const prev = useMemo(
    () => (range.compareEnabled ? orders.filter((o) => range.inPrev(tsOf(o))) : []),
    [orders, range],
  );

  const tCur = useMemo(() => summarize(cur), [cur]);
  const tPrev = useMemo(() => summarize(prev), [prev]);
  const currency = currencyOf(orders);

  const series = useMemo(() => {
    const start = scopeStart(cur, range.start);
    const buckets = buildBuckets(start, range.end, range.granularity);
    const shift = range.compareEnabled ? range.start - range.prevStart : 0;
    return buildSalesSeries(buckets, cur, prev, shift);
  }, [cur, prev, range]);

  const money = (v: number) => fmtMoney(v, currency);
  const hasData = cur.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        icon={<CalendarClock className="h-5 w-5 text-primary" />}
        title="Sales over time"
        subtitle="Net sales, orders, units and average order value across the selected range — the previous period is overlaid for comparison. Reads the stable Orders sheet."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />
      {isEmpty ? (
        <ReportEmpty icon={<CalendarClock className="h-7 w-7" />} />
      ) : (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Net sales"
            value={money(tCur.net)}
            icon={<DollarSign className="h-3.5 w-3.5" />}
            color={PALETTE.revenue}
            delta={deltaOf(tCur.net, tPrev.net)}
            spark={series.map((s) => s.net)}
          />
          <KpiCard
            label="Orders"
            value={fmtNum(tCur.orders)}
            icon={<ShoppingBag className="h-3.5 w-3.5" />}
            color={PALETTE.primary}
            delta={deltaOf(tCur.orders, tPrev.orders)}
            spark={series.map((s) => s.orders)}
          />
          <KpiCard
            label="Units sold"
            value={fmtNum(tCur.units)}
            icon={<Package className="h-3.5 w-3.5" />}
            color={PALETTE.ok}
            delta={deltaOf(tCur.units, tPrev.units)}
            spark={series.map((s) => s.units)}
          />
          <KpiCard
            label="Avg order value"
            value={money(tCur.aov)}
            icon={<Receipt className="h-3.5 w-3.5" />}
            color={PALETTE.violet}
            delta={deltaOf(tCur.aov, tPrev.aov)}
            spark={series.map((s) => s.aov)}
          />
        </div>

        <ChartCard
          title="Net sales & orders"
          desc="Daily net sales (area) with order count (bars); dashed line is the comparison period."
          right={<CompareLegend />}
        >
          {!hasData ? (
            <Empty icon={<CalendarClock className="h-8 w-8" />} title="No orders in this range" />
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="sot-net" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PALETTE.revenue} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={PALETTE.revenue} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                  <YAxis yAxisId="money" tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={fmtNum} />
                  <YAxis
                    yAxisId="count"
                    orientation="right"
                    tick={AXIS}
                    tickLine={false}
                    axisLine={false}
                    width={34}
                    tickFormatter={fmtNum}
                  />
                  <Tooltip
                    {...TOOLTIP}
                    formatter={(value: number, name: string) =>
                      name === "Orders" ? [fmtNum(value), name] : [money(value), name]
                    }
                  />
                  <Bar yAxisId="count" dataKey="orders" name="Orders" fill={PALETTE.primary} opacity={0.28} radius={[2, 2, 0, 0]} />
                  {range.compareEnabled && (
                    <Line
                      yAxisId="money"
                      type="monotone"
                      dataKey="prevNet"
                      name="Net (prev)"
                      stroke={PALETTE.compare}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                    />
                  )}
                  <Area
                    yAxisId="money"
                    type="monotone"
                    dataKey="net"
                    name="Net sales"
                    stroke={PALETTE.revenue}
                    strokeWidth={2}
                    fill="url(#sot-net)"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Breakdown by period" desc="Gross, discounts, refunds and net for each bucket on the axis above.">
          {!hasData ? (
            <Empty title="Nothing to break down yet" />
          ) : (
            <Table className="min-w-[620px]">
              <THead>
                <TR>
                  <TH>Period</TH>
                  <TH className="text-right">Gross</TH>
                  <TH className="text-right">Discounts</TH>
                  <TH className="text-right">Refunds</TH>
                  <TH className="text-right">Net</TH>
                  <TH className="text-right">Orders</TH>
                  <TH className="text-right">Units</TH>
                  <TH className="text-right">AOV</TH>
                </TR>
              </THead>
              <TBody>
                {series
                  .filter((s) => s.orders > 0 || s.refunds > 0)
                  .map((s, i) => (
                    <TR key={i}>
                      <TD className="font-medium text-foreground">{s.label}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{money(s.gross)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">
                        {s.discounts ? `-${money(s.discounts)}` : "—"}
                      </TD>
                      <TD className="text-right tabular-nums text-muted-foreground">
                        {s.refunds ? `-${money(s.refunds)}` : "—"}
                      </TD>
                      <TD className="text-right font-semibold tabular-nums text-foreground">{money(s.net)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(s.orders)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(s.units)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{s.orders ? money(s.aov) : "—"}</TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
          )}
        </ChartCard>
      </div>
      )}
    </div>
  );
}
