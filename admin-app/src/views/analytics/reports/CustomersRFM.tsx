/**
 * Customers — RFM segments report.
 *
 * Scores every customer (grouped by email, as-of the selected range end) on
 * Recency, Frequency and Monetary quintiles, then maps them to named segments —
 * Champions, Loyal, New, Promising, At risk, Churned. Renders the classic
 * Recency×Frequency quadrant (bubble = monetary), a per-segment summary with
 * revenue share, and a worked table.
 *
 * Consumes the GLOBAL date-range + compare context (`useDateRange`): recency is
 * measured as-of the range END, and when Compare is on each segment shows how its
 * customer count moved vs the previous period. Categorical segment colours come
 * from the shared reportKit palette and every segment is direct-labelled, so
 * identity is never colour-alone (dataviz method).
 */
import { useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  ResponsiveContainer,
} from "recharts";
import { Boxes, Crown, Table2 } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fmtMoney } from "@/lib/utils";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { useAnalyticsData } from "../useAnalyticsData";
import { useDateRange } from "./dateRange";
import { AXIS, GRID, TOOLTIP, KpiCard, ChartCard, ReportEmpty, ReportHeader, Delta, deltaOf } from "./reportKit";
import {
  rfmAnalysis,
  RFM_SEGMENTS,
  SEGMENT_COLOR,
  type RfmSegment,
} from "./customerMetrics";

/** Deterministic jitter in [-0.32, 0.32] from a string key, so co-located dots
 *  on the integer R×F grid spread out without moving between renders. */
function jitter(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * 0.64;
}

const SEGMENT_HINT: Record<RfmSegment, string> = {
  Champions: "Recent, frequent, high spend — reward & upsell",
  Loyal: "Consistent buyers — nurture and cross-sell",
  New: "Just acquired — onboard to a second order",
  Promising: "Recent but light — convert into repeat",
  "At risk": "Were engaged, going quiet — win back now",
  Churned: "Long dormant — reactivation campaign",
};

/** For these segments a decrease is the good direction. */
const LOWER_IS_BETTER = new Set<RfmSegment>(["At risk", "Churned"]);

export function CustomersRFM({ config }: { config: AppConfig }) {
  const { orders, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config);
  const r = useDateRange();

  const win = useMemo(() => ({ start: r.start, end: r.end }), [r.start, r.end]);
  const prevWin = useMemo(() => ({ start: r.prevStart, end: r.prevEnd }), [r.prevStart, r.prevEnd]);

  const rfm = useMemo(() => rfmAnalysis(orders, win), [orders, win]);
  const prevRfm = useMemo(
    () => (r.compareEnabled ? rfmAnalysis(orders, prevWin) : null),
    [orders, prevWin, r.compareEnabled],
  );
  const prevCount = (seg: RfmSegment) => prevRfm?.summary.find((s) => s.segment === seg)?.customers ?? 0;

  const scatterBySeg = useMemo(() => {
    const map = new Map<RfmSegment, { x: number; y: number; z: number; name: string }[]>();
    for (const c of rfm.customers) {
      const arr = map.get(c.segment) ?? [];
      arr.push({
        x: c.r + jitter(c.key),
        y: c.f + jitter(c.key + "f"),
        z: Math.max(1, c.monetary),
        name: c.name,
      });
      map.set(c.segment, arr);
    }
    return map;
  }, [rfm]);

  const champions = rfm.summary.find((s) => s.segment === "Champions");
  const atRisk = rfm.summary.find((s) => s.segment === "At risk");
  const repeatShare = rfm.total ? rfm.customers.filter((c) => c.frequency >= 2).length / rfm.total : 0;

  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        icon={<Boxes className="h-4 w-4 text-primary" />}
        title="Customers — RFM segments"
        subtitle="Recency / Frequency / Monetary quintiles map every customer into a segment as-of the range end — so you can reward Champions, win back At-risk, and onboard New buyers."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {isEmpty ? (
        <ReportEmpty icon={<Boxes className="h-7 w-7" />} />
      ) : rfm.total === 0 ? (
        <Empty
          icon={<Boxes className="h-8 w-8" />}
          title="No customers to segment"
          hint="RFM needs orders with a timestamp on or before the selected range end. Widen the range."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Customers scored" value={rfm.total.toLocaleString("en-US")} sub={`${fmtMoney(rfm.totalRevenue)} lifetime`} color={SEGMENT_COLOR.Loyal} />
            <KpiCard
              label="Champions"
              value={(champions?.customers ?? 0).toLocaleString("en-US")}
              color={SEGMENT_COLOR.Champions}
              delta={prevRfm ? deltaOf(champions?.customers ?? 0, prevCount("Champions")) : undefined}
              sub={`${((champions?.revenueShare ?? 0) * 100).toFixed(0)}% of revenue`}
            />
            <KpiCard
              label="At risk"
              value={(atRisk?.customers ?? 0).toLocaleString("en-US")}
              color={SEGMENT_COLOR["At risk"]}
              delta={prevRfm ? deltaOf(atRisk?.customers ?? 0, prevCount("At risk")) : undefined}
              higherIsBetter={false}
              sub={`${fmtMoney(atRisk?.revenue ?? 0)} at stake`}
            />
            <KpiCard label="Repeat share" value={`${(repeatShare * 100).toFixed(1)}%`} color={SEGMENT_COLOR.Promising} sub="customers with 2+ orders" />
          </div>

          {/* Quadrant + segment cards */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title={
                <span className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-primary" /> Recency × Frequency
                </span>
              }
              desc="Each dot is a customer; bubble size = lifetime spend"
            >
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 12, left: -6, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="Recency"
                      domain={[0.4, 5.6]}
                      ticks={[1, 2, 3, 4, 5]}
                      tick={AXIS}
                      tickLine={false}
                      axisLine={{ stroke: GRID }}
                      label={{ value: "Recency →  (5 = most recent)", position: "insideBottom", offset: -2, fill: "#9aa0a6", fontSize: 11 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Frequency"
                      domain={[0.4, 5.6]}
                      ticks={[1, 2, 3, 4, 5]}
                      tick={AXIS}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      label={{ value: "Frequency ↑", angle: -90, position: "insideLeft", fill: "#9aa0a6", fontSize: 11 }}
                    />
                    <ZAxis type="number" dataKey="z" range={[36, 420]} name="Spend" />
                    <Tooltip
                      {...TOOLTIP}
                      cursor={{ strokeDasharray: "3 3", stroke: GRID }}
                      formatter={(value: number, name: string) =>
                        name === "Spend" ? [fmtMoney(value), "Spend"] : [value.toFixed(1), name]
                      }
                    />
                    {RFM_SEGMENTS.filter((s) => scatterBySeg.has(s)).map((seg) => (
                      <Scatter key={seg} name={seg} data={scatterBySeg.get(seg)} fill={SEGMENT_COLOR[seg]} fillOpacity={0.72}>
                        {(scatterBySeg.get(seg) ?? []).map((_, i) => (
                          <Cell key={i} stroke="hsl(220 8% 7%)" strokeWidth={1} />
                        ))}
                      </Scatter>
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {RFM_SEGMENTS.filter((s) => scatterBySeg.has(s)).map((seg) => (
                  <span key={seg} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SEGMENT_COLOR[seg] }} />
                    <span className="text-foreground/80">{seg}</span>
                  </span>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Segments">
              <div className="flex flex-col gap-2">
                {rfm.summary.map((s) => (
                  <div key={s.segment} className="rounded-lg border border-border bg-card/60 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-sm font-medium">
                        <span className="h-3 w-3 rounded-[3px]" style={{ background: SEGMENT_COLOR[s.segment] }} />
                        {s.segment}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums">{s.customers.toLocaleString("en-US")}</span>
                        {prevRfm && <Delta value={deltaOf(s.customers, prevCount(s.segment))} higherIsBetter={!LOWER_IS_BETTER.has(s.segment)} />}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{SEGMENT_HINT[s.segment]}</div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{(s.share * 100).toFixed(0)}% of base</span>
                      <span className="tabular-nums">{fmtMoney(s.revenue)} · {(s.revenueShare * 100).toFixed(0)}% rev</span>
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          {/* Segment breakdown table */}
          <ChartCard
            title={
              <span className="flex items-center gap-2">
                <Table2 className="h-4 w-4 text-primary" /> Segment detail
              </span>
            }
          >
            <Table>
              <THead>
                <TR>
                  <TH>Segment</TH>
                  <TH className="text-right">Customers</TH>
                  <TH className="text-right">% base</TH>
                  <TH className="text-right">Avg recency</TH>
                  <TH className="text-right">Avg orders</TH>
                  <TH className="text-right">Avg spend</TH>
                  <TH className="text-right">Revenue</TH>
                  <TH className="text-right">% revenue</TH>
                </TR>
              </THead>
              <TBody>
                {rfm.summary.map((s) => (
                  <TR key={s.segment}>
                    <TD>
                      <span className="inline-flex items-center gap-2 font-medium">
                        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SEGMENT_COLOR[s.segment] }} />
                        {s.segment}
                      </span>
                    </TD>
                    <TD className="text-right tabular-nums">{s.customers.toLocaleString("en-US")}</TD>
                    <TD className="text-right tabular-nums text-muted-foreground">{(s.share * 100).toFixed(1)}%</TD>
                    <TD className="text-right tabular-nums text-muted-foreground">{Math.round(s.avgRecencyDays)}d</TD>
                    <TD className="text-right tabular-nums text-muted-foreground">{s.avgFrequency.toFixed(1)}</TD>
                    <TD className="text-right tabular-nums text-muted-foreground">{fmtMoney(s.avgMonetary)}</TD>
                    <TD className="text-right tabular-nums">{fmtMoney(s.revenue)}</TD>
                    <TD className="text-right">
                      <Badge variant={s.revenueShare >= 0.25 ? "ok" : s.revenueShare >= 0.1 ? "warn" : "muted"}>
                        {(s.revenueShare * 100).toFixed(0)}%
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </ChartCard>
        </>
      )}
    </div>
  );
}
