/**
 * Gross → net reconciliation — how gross sales become net across the selected
 * range: a waterfall bridge (gross − discounts − refunds = net), the gross/net
 * wedge over time, and a per-period reconciliation table. vs-previous deltas on
 * every headline figure.
 */
import { useMemo } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Coins, Landmark, Scale, TicketPercent, Undo2 } from "lucide-react";
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

export function SalesGrossNet({ config }: { config: AppConfig }) {
  const { cur, prev, range, currency, seeded, loading, liveCount, refresh } = useSalesScope(config);

  const tCur = useMemo(() => summarize(cur), [cur]);
  const tPrev = useMemo(() => summarize(prev), [prev]);
  const money = (v: number) => fmtMoney(v, currency);

  const series = useMemo(() => {
    const start = scopeStart(cur, range.start);
    const buckets = buildBuckets(start, range.end, range.granularity);
    const shift = range.compareEnabled ? range.start - range.prevStart : 0;
    return buildSalesSeries(buckets, cur, prev, shift);
  }, [cur, prev, range]);

  // Waterfall bridge: Gross → −Discounts → −Refunds → Net.
  const afterDisc = tCur.gross - tCur.discounts;
  const bridge = [
    { name: "Gross", base: 0, value: tCur.gross, fill: PALETTE.primary },
    { name: "Discounts", base: afterDisc, value: tCur.discounts, fill: PALETTE.rose },
    { name: "Refunds", base: tCur.net, value: tCur.refunds, fill: PALETTE.amber },
    { name: "Net", base: 0, value: tCur.net, fill: PALETTE.ok },
  ];
  const hasData = cur.length > 0;

  return (
    <ReportHeader
      icon={<Scale className="h-5 w-5 text-primary" />}
      title="Gross → net reconciliation"
      subtitle="How gross sales become net — gross minus discounts and refunds, across the selected range. Every figure shows its change vs the previous period; tax is reported separately."
      seeded={seeded}
      loading={loading}
      liveCount={liveCount}
      onRefresh={refresh}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Gross sales" value={money(tCur.gross)} icon={<Coins className="h-3.5 w-3.5" />} color={PALETTE.primary} delta={deltaOf(tCur.gross, tPrev.gross)} spark={series.map((s) => s.gross)} />
          <KpiCard label="Discounts" value={`-${money(tCur.discounts)}`} icon={<TicketPercent className="h-3.5 w-3.5" />} color={PALETTE.rose} delta={deltaOf(tCur.discounts, tPrev.discounts)} higherIsBetter={false} spark={series.map((s) => s.discounts)} />
          <KpiCard label="Refunds" value={`-${money(tCur.refunds)}`} icon={<Undo2 className="h-3.5 w-3.5" />} color={PALETTE.amber} delta={deltaOf(tCur.refunds, tPrev.refunds)} higherIsBetter={false} spark={series.map((s) => s.refunds)} />
          <KpiCard label="Net sales" value={money(tCur.net)} icon={<Scale className="h-3.5 w-3.5" />} color={PALETTE.ok} delta={deltaOf(tCur.net, tPrev.net)} spark={series.map((s) => s.net)} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Gross → net bridge" desc="What comes out of gross to leave net sales.">
            {!hasData ? (
              <Empty icon={<Scale className="h-8 w-8" />} title="No orders in this range" />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bridge} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={fmtNum} />
                    <Tooltip
                      {...TOOLTIP}
                      cursor={{ fill: "hsl(220 6% 14%)" }}
                      formatter={(v: number, n: string) => (n === "base" ? ["", ""] : [money(v), "Amount"])}
                    />
                    <Bar dataKey="base" stackId="w" fill="transparent" />
                    <Bar dataKey="value" stackId="w" radius={[3, 3, 0, 0]}>
                      {bridge.map((b, i) => (
                        <Cell key={i} fill={b.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Gross vs net over time" desc="The wedge between the lines is discounts + refunds." right={<CompareLegend />}>
            {!hasData ? (
              <Empty title="No orders in this range" />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="gn-net" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={PALETTE.ok} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={PALETTE.ok} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={fmtNum} />
                    <Tooltip {...TOOLTIP} formatter={(v: number, n: string) => [money(v), n]} />
                    <Line type="monotone" dataKey="gross" name="Gross" stroke={PALETTE.primary} strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="net" name="Net" stroke={PALETTE.ok} strokeWidth={2} fill="url(#gn-net)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>

        <ChartCard title="Reconciliation by period" desc="Gross, discounts, refunds, tax and net for each period.">
          {!hasData ? (
            <Empty title="Nothing to reconcile yet" />
          ) : (
            <Table className="min-w-[620px]">
              <THead>
                <TR>
                  <TH>Period</TH>
                  <TH className="text-right">Gross</TH>
                  <TH className="text-right">Discounts</TH>
                  <TH className="text-right">Refunds</TH>
                  <TH className="text-right">Tax</TH>
                  <TH className="text-right">Net</TH>
                </TR>
              </THead>
              <TBody>
                {series
                  .filter((s) => s.gross > 0 || s.refunds > 0)
                  .map((s, i) => (
                    <TR key={i}>
                      <TD className="font-medium text-foreground">{s.label}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{money(s.gross)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{s.discounts ? `-${money(s.discounts)}` : "—"}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{s.refunds ? `-${money(s.refunds)}` : "—"}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{s.tax ? money(s.tax) : "—"}</TD>
                      <TD className="text-right font-semibold tabular-nums text-foreground">{money(s.net)}</TD>
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
