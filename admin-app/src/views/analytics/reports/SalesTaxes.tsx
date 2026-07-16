/**
 * Sales taxes — tax collected over the selected range and by destination
 * country, with vs-previous deltas. Reads the tax column on each order and
 * degrades to a clean empty state when the Orders sheet doesn't carry one yet.
 */
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Landmark, Percent, Receipt, ShoppingBag } from "lucide-react";
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
import { buildSalesSeries, countryOf, groupDimension, scopeStart, summarize, taxOf } from "./salesData";

export function SalesTaxes({ config }: { config: AppConfig }) {
  const { cur, prev, range, currency, isEmpty, loading, liveCount, refresh } = useSalesScope(config);

  const tCur = useMemo(() => summarize(cur), [cur]);
  const tPrev = useMemo(() => summarize(prev), [prev]);
  const money = (v: number) => fmtMoney(v, currency);

  const series = useMemo(() => {
    const start = scopeStart(cur, range.start);
    const buckets = buildBuckets(start, range.end, range.granularity);
    return buildSalesSeries(buckets, cur, prev, 0);
  }, [cur, prev, range]);

  const byRegion = useMemo(
    () => groupDimension(cur, range.compareEnabled ? prev : null, (o) => countryOf(o) || "??", (o) => countryOf(o) || "(unknown)", (o) => taxOf(o) > 0),
    [cur, prev, range.compareEnabled],
  );

  const taxableOrders = useMemo(() => cur.filter((o) => taxOf(o) > 0).length, [cur]);
  const effRate = tCur.net ? tCur.tax / tCur.net : 0;
  const hasTax = tCur.tax > 0;

  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        icon={<Landmark className="h-5 w-5 text-primary" />}
        title="Taxes"
        subtitle="Tax collected across the selected range and by destination — with the effective tax rate against net sales. Lights up automatically when the Orders sheet carries a tax column."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />
      {isEmpty ? (
        <ReportEmpty icon={<Landmark className="h-7 w-7" />} />
      ) : (
        <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Tax collected" value={money(tCur.tax)} icon={<Landmark className="h-3.5 w-3.5" />} color={PALETTE.violet} delta={deltaOf(tCur.tax, tPrev.tax)} spark={series.map((s) => s.tax)} />
          <KpiCard label="Effective tax rate" value={fmtPct(effRate)} icon={<Percent className="h-3.5 w-3.5" />} color={PALETTE.amber} sub="tax ÷ net sales" />
          <KpiCard label="Taxable orders" value={fmtNum(taxableOrders)} icon={<ShoppingBag className="h-3.5 w-3.5" />} color={PALETTE.primary} />
          <KpiCard label="Net sales" value={money(tCur.net)} icon={<Receipt className="h-3.5 w-3.5" />} color={PALETTE.revenue} delta={deltaOf(tCur.net, tPrev.net)} />
        </div>

        <ChartCard title="Tax collected over time" desc="Tax per period across the selected range.">
          {!hasTax ? (
            <Empty icon={<Landmark className="h-8 w-8" />} title="No tax recorded in this range" hint="Add a tax / vat / gst column to the Orders sheet and this fills in automatically." />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={fmtNum} />
                  <Tooltip {...TOOLTIP} cursor={{ fill: "hsl(220 6% 14%)" }} formatter={(v: number) => [money(v), "Tax"]} />
                  <Bar dataKey="tax" name="Tax" fill={PALETTE.violet} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Tax by destination" desc="Tax collected per country in the selected range.">
          {!hasTax ? (
            <Empty title="No tax to break down" />
          ) : (
            <DimTable rows={byRegion} labelHeader="Country" currency={currency} valueKey="tax" valueHeader="Tax" showDelta={false} />
          )}
        </ChartCard>
        </>
      )}
    </div>
  );
}
