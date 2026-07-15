/**
 * Average order value over time — AOV and units-per-order across the selected
 * range with the previous period overlaid, plus a per-period table. Graph +
 * table, driven by the shared date-range/compare context.
 */
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Boxes, Receipt, ShoppingBag, TrendingUp } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fmtMoney } from "@/lib/utils";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { useSalesScope } from "./salesScope";
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
  ReportHeader,
  TOOLTIP,
} from "./reportKit";
import { buildSalesSeries, scopeStart, summarize } from "./salesData";

export function SalesAov({ config }: { config: AppConfig }) {
  const { cur, prev, range, currency, seeded, loading, liveCount, refresh } = useSalesScope(config);

  const tCur = useMemo(() => summarize(cur), [cur]);
  const tPrev = useMemo(() => summarize(prev), [prev]);
  const money = (v: number) => fmtMoney(v, currency);

  const series = useMemo(() => {
    const start = scopeStart(cur, range.start);
    const buckets = buildBuckets(start, range.end, range.granularity);
    const shift = range.compareEnabled ? range.start - range.prevStart : 0;
    const pts = buildSalesSeries(buckets, cur, prev, shift);
    return pts.map((p) => ({
      ...p,
      prevAov: p.prevOrders ? p.prevNet / p.prevOrders : 0,
      upo: p.orders ? p.units / p.orders : 0,
    }));
  }, [cur, prev, range]);

  const upoCur = tCur.orders ? tCur.units / tCur.orders : 0;
  const upoPrev = tPrev.orders ? tPrev.units / tPrev.orders : 0;
  const hasData = cur.length > 0;

  return (
    <ReportHeader
      icon={<TrendingUp className="h-5 w-5 text-primary" />}
      title="Average order value over time"
      subtitle="How much each order is worth over the selected range — AOV and units-per-order, with the previous period overlaid for comparison."
      seeded={seeded}
      loading={loading}
      liveCount={liveCount}
      onRefresh={refresh}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Avg order value"
            value={money(tCur.aov)}
            icon={<Receipt className="h-3.5 w-3.5" />}
            color={PALETTE.revenue}
            delta={deltaOf(tCur.aov, tPrev.aov)}
            spark={series.map((s) => s.aov)}
          />
          <KpiCard
            label="Orders"
            value={fmtNum(tCur.orders)}
            icon={<ShoppingBag className="h-3.5 w-3.5" />}
            color={PALETTE.primary}
            delta={deltaOf(tCur.orders, tPrev.orders)}
          />
          <KpiCard
            label="Units / order"
            value={upoCur.toFixed(2)}
            icon={<Boxes className="h-3.5 w-3.5" />}
            color={PALETTE.ok}
            delta={deltaOf(upoCur, upoPrev)}
            spark={series.map((s) => s.upo)}
          />
          <KpiCard
            label="Net sales"
            value={money(tCur.net)}
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            color={PALETTE.violet}
            delta={deltaOf(tCur.net, tPrev.net)}
          />
        </div>

        <ChartCard title="AOV trend" desc="Average order value per period; dashed line is the comparison period." right={<CompareLegend />}>
          {!hasData ? (
            <Empty icon={<Receipt className="h-8 w-8" />} title="No orders in this range" />
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={fmtNum} />
                  <Tooltip {...TOOLTIP} formatter={(v: number, n: string) => [money(v), n]} />
                  {range.compareEnabled && (
                    <Line
                      type="monotone"
                      dataKey="prevAov"
                      name="AOV (prev)"
                      stroke={PALETTE.compare}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                    />
                  )}
                  <Line type="monotone" dataKey="aov" name="AOV" stroke={PALETTE.revenue} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="AOV by period" desc="Orders, net sales, AOV and basket size for each period.">
          {!hasData ? (
            <Empty title="Nothing to break down yet" />
          ) : (
            <Table className="min-w-[560px]">
              <THead>
                <TR>
                  <TH>Period</TH>
                  <TH className="text-right">Orders</TH>
                  <TH className="text-right">Net sales</TH>
                  <TH className="text-right">AOV</TH>
                  <TH className="text-right">Units / order</TH>
                </TR>
              </THead>
              <TBody>
                {series
                  .filter((s) => s.orders > 0)
                  .map((s, i) => (
                    <TR key={i}>
                      <TD className="font-medium text-foreground">{s.label}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(s.orders)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{money(s.net)}</TD>
                      <TD className="text-right font-semibold tabular-nums text-foreground">{money(s.aov)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{s.upo.toFixed(2)}</TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
          )}
        </ChartCard>
      </div>
    </ReportHeader>
  );
}
