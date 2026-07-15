/**
 * Sales by discount — discount spend over the selected range and per discount
 * code, with the discount rate against gross. Reads a discount amount/code (or a
 * "code: …" stamp in notes) and degrades cleanly when the Orders sheet records
 * no discounts.
 */
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgePercent, Percent, TicketPercent, Wallet } from "lucide-react";
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
  ReportHeader,
  TOOLTIP,
} from "./reportKit";
import { DimTable } from "./salesTable";
import { buildSalesSeries, discountCodeOf, discountOf, groupDimension, scopeStart, summarize } from "./salesData";

export function SalesByDiscount({ config }: { config: AppConfig }) {
  const { cur, prev, range, currency, seeded, loading, liveCount, refresh } = useSalesScope(config);

  const tCur = useMemo(() => summarize(cur), [cur]);
  const tPrev = useMemo(() => summarize(prev), [prev]);
  const money = (v: number) => fmtMoney(v, currency);

  const series = useMemo(() => {
    const start = scopeStart(cur, range.start);
    const buckets = buildBuckets(start, range.end, range.granularity);
    return buildSalesSeries(buckets, cur, prev, 0);
  }, [cur, prev, range]);

  const isDiscounted = (o: Parameters<typeof discountOf>[0]) => discountOf(o) > 0 || !!discountCodeOf(o);
  const byCode = useMemo(
    () =>
      groupDimension(
        cur,
        range.compareEnabled ? prev : null,
        (o) => discountCodeOf(o) || "(automatic)",
        (o) => discountCodeOf(o) || "(automatic / no code)",
        isDiscounted,
      ),
    [cur, prev, range.compareEnabled],
  );

  const discountRate = tCur.gross ? tCur.discounts / tCur.gross : 0;
  const hasDiscounts = tCur.discounts > 0 || tCur.discountedOrders > 0;

  return (
    <ReportHeader
      icon={<TicketPercent className="h-5 w-5 text-primary" />}
      title="Sales by discount"
      subtitle="What discounts cost and return — discount spend over the selected range and per code, with the discount rate against gross sales. Lights up automatically when the Orders sheet carries a discount column or code."
      seeded={seeded}
      loading={loading}
      liveCount={liveCount}
      onRefresh={refresh}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Discount spend" value={money(tCur.discounts)} icon={<Wallet className="h-3.5 w-3.5" />} color={PALETTE.rose} delta={deltaOf(tCur.discounts, tPrev.discounts)} higherIsBetter={false} spark={series.map((s) => s.discounts)} />
          <KpiCard label="Discounted orders" value={fmtNum(tCur.discountedOrders)} icon={<BadgePercent className="h-3.5 w-3.5" />} color={PALETTE.amber} delta={deltaOf(tCur.discountedOrders, tPrev.discountedOrders)} />
          <KpiCard label="Discount rate" value={fmtPct(discountRate)} icon={<Percent className="h-3.5 w-3.5" />} color={PALETTE.violet} sub="discounts ÷ gross" />
          <KpiCard label="Net sales" value={money(tCur.net)} icon={<Wallet className="h-3.5 w-3.5" />} color={PALETTE.revenue} delta={deltaOf(tCur.net, tPrev.net)} />
        </div>

        <ChartCard title="Discount spend over time" desc="Discount value applied per period across the selected range.">
          {!hasDiscounts ? (
            <Empty icon={<TicketPercent className="h-8 w-8" />} title="No discounts in this range" hint="Add a discount amount or discount_code column to the Orders sheet (or a 'code: …' note) and this fills in automatically." />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={fmtNum} />
                  <Tooltip {...TOOLTIP} cursor={{ fill: "hsl(220 6% 14%)" }} formatter={(v: number) => [money(v), "Discounts"]} />
                  <Bar dataKey="discounts" name="Discounts" fill={PALETTE.rose} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Discounts by code" desc="Discount spend, orders and net per discount code in the selected range.">
          {!hasDiscounts ? (
            <Empty title="No discount codes to break down" />
          ) : (
            <DimTable rows={byCode} labelHeader="Discount code" currency={currency} valueKey="discounts" valueHeader="Discount" showDelta={false} />
          )}
        </ChartCard>
      </div>
    </ReportHeader>
  );
}
