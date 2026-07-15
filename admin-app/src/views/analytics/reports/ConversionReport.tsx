/**
 * Conversion report — the funnel and where it leaks, at Shopify-parity.
 *
 * Scoped to the GLOBAL date range (with an optional previous-period comparison),
 * it answers: conversion rate over time (vs previous), the core funnel
 * Sessions → Added to cart → Reached checkout → Converted with the drop-off at
 * every step, that same funnel split by device and by source, and the value
 * sitting in abandoned carts.
 *
 * Sessions are rolled from the stable Telemetry + Orders sheets by
 * `rollupSessions` (with the deterministic seed fallback), so the funnel agrees
 * with the Sessions & Behavior report and the rest of the analytics suite.
 */
import { useMemo } from "react";
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
import {
  ArrowDown,
  Layers,
  Monitor,
  Radio,
  ShoppingCart,
  Target,
  TrendingDown,
  Wallet,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { CHANNEL_COLOR, type Channel } from "@/lib/acquisition";
import { timeOf } from "@/lib/telemetryFields";
import { cn, fmtMoney } from "@/lib/utils";
import { useAnalyticsData } from "../useAnalyticsData";
import { type DeviceType } from "../deviceTech";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { useDateRange } from "./dateRange";
import {
  AXIS,
  ChartCard,
  CompareLegend,
  GRID,
  KpiCard,
  PALETTE,
  ReportHeader,
  TOOLTIP,
  buildBuckets,
  deltaOf,
  fmtNum,
  fmtPct,
} from "./reportKit";
import {
  abandonment,
  bucketize,
  funnelBy,
  funnelCounts,
  funnelStages,
  rollupSessions,
  type FunnelBreakRow,
} from "./sessionsData";

const STAGE_COLOR: Record<string, string> = {
  sessions: PALETTE.primary,
  cart: PALETTE.amber,
  checkout: PALETTE.violet,
  converted: PALETTE.ok,
};

const DEVICE_COLOR: Record<DeviceType, string> = {
  desktop: "hsl(210 72% 56%)",
  mobile: "hsl(4 65% 54%)",
  tablet: "hsl(38 92% 55%)",
  unknown: "hsl(220 6% 42%)",
};

function orderTime(o: { timestamp?: string; received_at?: string }): number {
  return Date.parse(String(o.timestamp ?? o.received_at ?? ""));
}

export function ConversionReport({ config }: { config: AppConfig }) {
  const { events, orders, seeded, loading, liveCount, refresh } = useAnalyticsData(config);
  const range = useDateRange();

  const d = useMemo(() => {
    const curOrders = orders.filter((o) => range.inRange(orderTime(o as never)));
    const currency = (curOrders.find((o) => o.currency)?.currency as string) || "USD";

    const rows = rollupSessions(events, orders);
    const cur = rows.filter((r) => range.inRange(r.start));
    const prev = rows.filter((r) => range.inPrev(r.start));

    const counts = funnelCounts(cur);
    const stages = funnelStages(counts);

    const cr = counts.sessions ? counts.converted / counts.sessions : 0;
    const pCounts = funnelCounts(prev);
    const pCr = pCounts.sessions ? pCounts.converted / pCounts.sessions : 0;

    const buckets = buildBuckets(range.start, range.end, range.granularity);
    const prevBuckets = range.compareEnabled
      ? buildBuckets(range.prevStart, range.prevEnd, range.granularity)
      : undefined;
    const series = bucketize(cur, buckets, range.compareEnabled ? prev : undefined, prevBuckets);

    const byDevice = funnelBy(cur, (r) => r.device).filter((b) => b.sessions > 0);
    const byChannel = funnelBy(cur, (r) => r.channel);

    const ab = abandonment(cur);
    const pAb = abandonment(prev);

    // Abandoned value by channel (recoverable revenue per source).
    const abByChannel = [...new Set(cur.map((r) => r.channel))]
      .map((ch) => ({ channel: ch, ...abandonment(cur.filter((r) => r.channel === ch)) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);

    return {
      currency,
      counts,
      stages,
      series,
      byDevice,
      byChannel,
      ab,
      abByChannel,
      cr,
      d_cr: deltaOf(cr, pCr),
      d_conv: deltaOf(counts.converted, pCounts.converted),
      d_cart: deltaOf(counts.cart, pCounts.cart),
      d_abVal: deltaOf(ab.value, pAb.value),
      d_abCarts: deltaOf(ab.carts, pAb.carts),
    };
  }, [events, orders, range]);

  const money = (v: number) => fmtMoney(v, d.currency);

  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        icon={<Layers className="h-5 w-5 text-primary" />}
        title="Conversion"
        subtitle="Conversion rate over time and the Sessions → Cart → Checkout → Converted funnel with the drop-off at every step — split by device and source — plus the value sitting in abandoned carts. Scoped to the selected range with vs-previous deltas."
        seeded={seeded}
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          label="Conversion rate"
          value={fmtPct(d.cr)}
          icon={<Target className="h-3.5 w-3.5" />}
          color={PALETTE.ok}
          delta={d.d_cr}
          spark={d.series.map((p) => p.cr * 100)}
        />
        <KpiCard
          label="Converted"
          value={fmtNum(d.counts.converted)}
          icon={<Target className="h-3.5 w-3.5" />}
          color={PALETTE.primary}
          delta={d.d_conv}
        />
        <KpiCard
          label="Reached cart"
          value={fmtNum(d.counts.cart)}
          icon={<ShoppingCart className="h-3.5 w-3.5" />}
          color={PALETTE.amber}
          delta={d.d_cart}
          sub={`${fmtPct(d.counts.sessions ? d.counts.cart / d.counts.sessions : 0)} of sessions`}
        />
        <KpiCard
          label="Abandoned carts"
          value={fmtNum(d.ab.carts)}
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          color={PALETTE.rose}
          delta={d.d_abCarts}
          higherIsBetter={false}
          sub={`${fmtPct(d.ab.abandonRate)} of carts`}
        />
        <KpiCard
          label="Abandoned value"
          value={money(d.ab.value)}
          icon={<Wallet className="h-3.5 w-3.5" />}
          color={PALETTE.revenue}
          delta={d.d_abVal}
          higherIsBetter={false}
          sub={`AOV ${money(d.ab.aov)}`}
        />
      </div>

      {/* Conversion rate over time */}
      <ChartCard
        title="Conversion rate over time"
        desc="Converting sessions ÷ sessions per period, with the previous-period overlay."
        right={<CompareLegend />}
      >
        {d.series.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={d.series} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
              <YAxis
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              />
              <Tooltip
                {...TOOLTIP}
                formatter={(v: number, name: string) => [`${(v * 100).toFixed(2)}%`, name]}
              />
              <Line
                type="monotone"
                dataKey="cr"
                name="Conversion rate"
                stroke={PALETTE.ok}
                strokeWidth={2.5}
                dot={false}
              />
              {range.compareEnabled && (
                <Line
                  type="monotone"
                  dataKey="prevCr"
                  name="Conversion rate (prev)"
                  stroke={PALETTE.compare}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <Empty icon={<Target className="h-6 w-6" />} title="No sessions in this range" />
        )}
      </ChartCard>

      {/* The funnel */}
      <ChartCard
        title="Conversion funnel"
        desc="Distinct sessions reaching each stage, with the drop-off between steps."
        right={<Layers className="h-4 w-4 text-muted-foreground" />}
      >
        {d.counts.sessions ? (
          <FunnelBars stages={d.stages} />
        ) : (
          <Empty icon={<Layers className="h-6 w-6" />} title="No sessions in this range" />
        )}
      </ChartCard>

      {/* Funnel by device + source */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Funnel by device"
          desc="Stage reach and conversion rate per device type."
          right={<Monitor className="h-4 w-4 text-muted-foreground" />}
        >
          <FunnelBreak rows={d.byDevice} colorOf={(k) => DEVICE_COLOR[k as DeviceType]} />
        </ChartCard>

        <ChartCard
          title="Funnel by source"
          desc="Stage reach and conversion rate per marketing channel."
          right={<Radio className="h-4 w-4 text-muted-foreground" />}
        >
          <FunnelBreak rows={d.byChannel} colorOf={(k) => CHANNEL_COLOR[k as Channel]} />
        </ChartCard>
      </div>

      {/* Abandoned cart value */}
      <ChartCard
        title="Abandoned cart value"
        desc="Recoverable revenue in carts that reached the cart or checkout but never converted, by source."
        right={
          d.ab.carts > 0 ? (
            <Badge variant="warn">{money(d.ab.value)} recoverable</Badge>
          ) : (
            <Wallet className="h-4 w-4 text-muted-foreground" />
          )
        }
      >
        {d.abByChannel.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <ResponsiveContainer width="100%" height={Math.max(160, d.abByChannel.length * 40)}>
              <BarChart data={d.abByChannel} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={AXIS}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => money(v)}
                />
                <YAxis type="category" dataKey="channel" tick={AXIS} tickLine={false} axisLine={false} width={72} />
                <Tooltip {...TOOLTIP} formatter={(v: number) => money(v)} />
                <Bar dataKey="value" name="Abandoned value" radius={[0, 4, 4, 0]}>
                  {d.abByChannel.map((r) => (
                    <Cell key={r.channel} fill={CHANNEL_COLOR[r.channel as Channel]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Source</TH>
                    <TH className="text-right">Carts</TH>
                    <TH className="text-right">Abandon rate</TH>
                    <TH className="text-right">Value</TH>
                  </TR>
                </THead>
                <TBody>
                  {d.abByChannel.map((r) => (
                    <TR key={r.channel}>
                      <TD className="whitespace-nowrap">
                        <span
                          className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                          style={{ background: CHANNEL_COLOR[r.channel as Channel] }}
                        />
                        {r.channel}
                      </TD>
                      <TD className="text-right tabular-nums">{fmtNum(r.carts)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{fmtPct(r.abandonRate)}</TD>
                      <TD className="text-right tabular-nums font-medium">{money(r.value)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        ) : (
          <Empty
            icon={<Wallet className="h-6 w-6" />}
            title="No abandoned carts in this range"
            hint="Either no sessions reached the cart, or every cart converted."
          />
        )}
      </ChartCard>
    </div>
  );
}

/* ------------------------------------------------------------- sub-pieces -- */

function FunnelBars({
  stages,
}: {
  stages: { key: string; label: string; count: number; ofTop: number; ofPrev: number; dropped: number }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      {stages.map((s, i) => (
        <div key={s.key}>
          {i > 0 && (
            <div className="flex items-center gap-1.5 py-1 pl-1 text-[11px] text-muted-foreground">
              <ArrowDown className="h-3 w-3" />
              <span className="text-down">
                {fmtNum(s.dropped)} dropped ({fmtPct(1 - s.ofPrev)})
              </span>
              <span className="text-muted-foreground/60">· {fmtPct(s.ofPrev)} continue</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="relative h-11 flex-1 overflow-hidden rounded-lg bg-muted/40">
              <div
                className="flex h-full items-center rounded-lg px-3 transition-all"
                style={{
                  width: `${Math.max(6, s.ofTop * 100)}%`,
                  background: STAGE_COLOR[s.key],
                  opacity: 0.9,
                }}
              >
                <span className="truncate text-sm font-semibold text-white drop-shadow-sm">{s.label}</span>
              </div>
            </div>
            <div className="w-28 shrink-0 text-right">
              <div className="text-lg font-semibold tabular-nums leading-none">{fmtNum(s.count)}</div>
              <div className="text-[11px] text-muted-foreground">{fmtPct(s.ofTop)} of sessions</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FunnelBreak({
  rows,
  colorOf,
}: {
  rows: FunnelBreakRow[];
  colorOf: (key: string) => string;
}) {
  if (!rows.length) return <Empty icon={<Layers className="h-6 w-6" />} title="No sessions in this range" />;
  const maxCr = Math.max(0.0001, ...rows.map((r) => r.cr));
  return (
    <div className="overflow-x-auto">
      <Table>
        <THead>
          <TR>
            <TH>Segment</TH>
            <TH className="text-right">Sessions</TH>
            <TH className="text-right">Cart</TH>
            <TH className="text-right">Checkout</TH>
            <TH className="text-right">Converted</TH>
            <TH className="w-[120px] text-right">CR</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.key}>
              <TD className="whitespace-nowrap capitalize">
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ background: colorOf(r.key) }}
                />
                {r.label}
              </TD>
              <TD className="text-right tabular-nums">{fmtNum(r.sessions)}</TD>
              <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(r.cart)}</TD>
              <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(r.checkout)}</TD>
              <TD className="text-right tabular-nums">{fmtNum(r.converted)}</TD>
              <TD>
                <div className="flex items-center justify-end gap-2">
                  <span className="tabular-nums text-ok">{fmtPct(r.cr)}</span>
                  <span className="block h-1.5 w-12 overflow-hidden rounded bg-muted">
                    <span
                      className="block h-full rounded"
                      style={{ width: `${Math.max(3, (r.cr / maxCr) * 100)}%`, background: colorOf(r.key) }}
                    />
                  </span>
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

export default ConversionReport;
