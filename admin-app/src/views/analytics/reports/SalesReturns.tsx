/**
 * Returns & refunds — refunded value over the selected range, refund rate, and
 * the products most returned, with vs-previous deltas. Detects refunds from an
 * explicit refund amount or a refunded/returned/cancelled status, and degrades
 * to a clean empty state when the Orders sheet records none.
 */
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Percent, RotateCcw, Undo2, Wallet } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fmtMoney } from "@/lib/utils";
import { Empty } from "@/components/Empty";
import { useSalesScope } from "./salesScope";
import {
  AXIS,
  buildBuckets,
  ChartCard,
  deltaOf,
  fmtNum,
  fmtPct,
  GRID,
  KpiCard,
  PALETTE,
  ReportEmpty,
  ReportHeader,
  TOOLTIP,
} from "./reportKit";
import { DimTable } from "./salesTable";
import { buildSalesSeries, groupDimension, isRefunded, productOf, scopeStart, summarize } from "./salesData";

export function SalesReturns({ config }: { config: AppConfig }) {
  const { cur, prev, range, currency, isEmpty, loading, liveCount, refresh } = useSalesScope(config);

  const tCur = useMemo(() => summarize(cur), [cur]);
  const tPrev = useMemo(() => summarize(prev), [prev]);
  const money = (v: number) => fmtMoney(v, currency);

  const series = useMemo(() => {
    const start = scopeStart(cur, range.start);
    const buckets = buildBuckets(start, range.end, range.granularity);
    return buildSalesSeries(buckets, cur, prev, 0);
  }, [cur, prev, range]);

  const byProduct = useMemo(
    () => groupDimension(cur, range.compareEnabled ? prev : null, productOf, productOf, isRefunded),
    [cur, prev, range.compareEnabled],
  );

  const totalOrders = tCur.orders + tCur.refundedOrders;
  const refundRate = totalOrders ? tCur.refundedOrders / totalOrders : 0;
  const grossBeforeRefunds = tCur.net + tCur.refunds;
  const hasRefunds = tCur.refundedOrders > 0 || tCur.refunds > 0;

  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        icon={<Undo2 className="h-5 w-5 text-primary" />}
        title="Returns & refunds"
        subtitle="What's coming back — refunded value over the selected range, the refund rate, and the products most returned, each with its change vs the previous period."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />
      {isEmpty ? (
        <ReportEmpty icon={<Undo2 className="h-7 w-7" />} />
      ) : (
        <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Refunded value" value={money(tCur.refunds)} icon={<Wallet className="h-3.5 w-3.5" />} color={PALETTE.rose} delta={deltaOf(tCur.refunds, tPrev.refunds)} higherIsBetter={false} spark={series.map((s) => s.refunds)} />
          <KpiCard label="Refunded orders" value={fmtNum(tCur.refundedOrders)} icon={<RotateCcw className="h-3.5 w-3.5" />} color={PALETTE.amber} delta={deltaOf(tCur.refundedOrders, tPrev.refundedOrders)} higherIsBetter={false} />
          <KpiCard label="Refund rate" value={fmtPct(refundRate)} icon={<Percent className="h-3.5 w-3.5" />} color={PALETTE.violet} sub="refunded ÷ all orders" />
          <KpiCard label="Net after refunds" value={money(tCur.net)} icon={<Wallet className="h-3.5 w-3.5" />} color={PALETTE.revenue} sub={`${money(grossBeforeRefunds)} before refunds`} />
        </div>

        <ChartCard title="Refunds over time" desc="Refunded value per period across the selected range.">
          {!hasRefunds ? (
            <Empty icon={<Undo2 className="h-8 w-8" />} title="No returns or refunds in this range" hint="Refunds are detected from a refund amount or a refunded/returned/cancelled status on the order." />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={fmtNum} />
                  <Tooltip {...TOOLTIP} cursor={{ fill: "hsl(220 6% 14%)" }} formatter={(v: number) => [money(v), "Refunds"]} />
                  <Bar dataKey="refunds" name="Refunds" fill={PALETTE.rose} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Most returned products" desc="Refunded value per product in the selected range.">
          {!hasRefunds ? (
            <Empty title="Nothing returned to break down" />
          ) : (
            <DimTable rows={byProduct} labelHeader="Product" currency={currency} valueKey="refunds" valueHeader="Refunded" showDelta={false} />
          )}
        </ChartCard>
        </>
      )}
    </div>
  );
}
