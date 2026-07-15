/**
 * MARKETING report — how paid / owned / earned channels drive sessions and, more
 * importantly, revenue for the globally-selected date range.
 *
 * Consumes the GLOBAL date-range + compare context (`useDateRange`): every KPI
 * shows a vs-previous-period delta and the attributed-revenue trend overlays the
 * previous window. Sections:
 *   • sales attributed to marketing (paid/email/social/referral) vs total,
 *   • sessions & conversions by UTM source, medium and campaign,
 *   • conversion rate per campaign,
 *   • top referrers (first-touch, from the landing page's referrer).
 *
 * Self-fetches the STABLE Telemetry + Orders sheets via `useAnalyticsData` with
 * the deterministic-seed fallback, and reuses `lib/utm.buildCampaigns` for the
 * UTM aggregation so the numbers match the rest of the analytics suite.
 */
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Megaphone,
  DollarSign,
  MousePointerClick,
  Target,
  Percent,
  PieChart as PieIcon,
  TrendingUp,
  Radio,
  Users,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import { fmtMoney } from "@/lib/utils";
import { buildCampaigns } from "@/lib/utm";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { MeterBar } from "../shell";
import { useAnalyticsData } from "../useAnalyticsData";
import { useDateRange } from "./dateRange";
import {
  AXIS,
  GRID,
  TOOLTIP,
  PALETTE,
  SERIES_COLORS,
  KpiCard,
  ChartCard,
  ReportHeader,
  CompareLegend,
  Delta,
  deltaOf,
  fmtNum,
  fmtPct,
  buildBuckets,
} from "./reportKit";
import {
  evTime,
  grossOf,
  isOrderEvent,
  metaOf,
  metaNum,
  metaStr,
  referrerLabel,
  sessKey,
} from "./reportMetrics";

const DAY = 86_400_000;
const MK_MEDIUM_RE = /cpc|ppc|paid|email|social|banner|affiliate|display|referral/;
const MK_SOURCE_RE = /facebook|instagram|linkedin|twitter|tiktok|newsletter|email|ads|affiliate|reddit|youtube/;

/** Is a UTM medium a marketing channel (vs organic / direct)? */
const isMkMedium = (m: string): boolean => MK_MEDIUM_RE.test(m.toLowerCase());

/** Classify an order as marketing-attributed from its stamped source/campaign. */
function orderIsMarketing(o: Order): boolean {
  const notes = String(o.notes ?? "");
  const m = /via\s+([a-z0-9_.()-]+)(?:\/([a-z0-9_-]+))?/i.exec(notes);
  const campaign =
    (m && m[2]) ||
    String((o as Record<string, unknown>).utm_campaign ?? (o as Record<string, unknown>).campaign ?? "");
  if (campaign) return true;
  const source = (m ? m[1] : String((o as Record<string, unknown>).utm_source ?? "")).toLowerCase();
  return MK_SOURCE_RE.test(source);
}

interface RefRow {
  ref: string;
  sessions: number;
  orders: number;
  revenue: number;
}

/** First-touch referrer table over the window's events. */
function referrerTable(events: TelemetryEvent[]): RefRow[] {
  const sorted = [...events].sort((a, b) => evTime(a) - evTime(b));
  const firstRef = new Map<string, string>();
  const sessOrder = new Map<string, { ordered: boolean; rev: number }>();
  for (const e of sorted) {
    const s = sessKey(e);
    if (!s) continue;
    if (!firstRef.has(s)) {
      const m = metaOf(e);
      firstRef.set(s, referrerLabel(metaStr(m, "referrer", "referer")));
    }
    if (isOrderEvent(e)) {
      const m = metaOf(e);
      const rev = metaNum(m, "price", "value") * (metaNum(m, "quantity", "qty") || 1);
      const cur = sessOrder.get(s) ?? { ordered: false, rev: 0 };
      cur.ordered = true;
      cur.rev += rev;
      sessOrder.set(s, cur);
    }
  }
  const rows = new Map<string, RefRow>();
  for (const [s, ref] of firstRef) {
    const r = rows.get(ref) ?? { ref, sessions: 0, orders: 0, revenue: 0 };
    r.sessions += 1;
    const ord = sessOrder.get(s);
    if (ord?.ordered) {
      r.orders += 1;
      r.revenue += ord.rev;
    }
    rows.set(ref, r);
  }
  return [...rows.values()].sort((a, b) => b.sessions - a.sessions);
}

export function MarketingReport({ config }: { config: AppConfig }) {
  const { events, orders, seeded, loading, liveCount, refresh } = useAnalyticsData(config);
  const range = useDateRange();

  const model = useMemo(() => {
    const curEvents = events.filter((e) => range.inRange(evTime(e)));
    const prevEvents = events.filter((e) => range.inPrev(evTime(e)));
    const curOrders = orders.filter((o) => range.inRange(evTime(o)));
    const prevOrders = orders.filter((o) => range.inPrev(evTime(o)));

    const cur = buildCampaigns(curEvents, curOrders);
    const prev = buildCampaigns(prevEvents, prevOrders);

    const currency =
      (curOrders.find((o) => o.currency)?.currency as string) ||
      (orders.find((o) => o.currency)?.currency as string) ||
      "USD";

    // Marketing-attributed revenue (order-based) — current & previous.
    const mkOrders = curOrders.filter(orderIsMarketing);
    const mkRevenue = mkOrders.reduce((a, o) => a + grossOf(o), 0);
    const mkOrderCount = mkOrders.length;
    const prevMkRevenue = prevOrders.filter(orderIsMarketing).reduce((a, o) => a + grossOf(o), 0);
    const prevMkOrderCount = prevOrders.filter(orderIsMarketing).length;
    const totalRevenue = curOrders.reduce((a, o) => a + grossOf(o), 0);
    const attributedShare = totalRevenue ? mkRevenue / totalRevenue : 0;

    // Marketing sessions / conversions from UTM mediums.
    const mkMediums = cur.mediums.filter((m) => isMkMedium(m.medium));
    const mkSessions = mkMediums.reduce((a, m) => a + m.sessions, 0);
    const mkConversions = mkMediums.reduce((a, m) => a + m.conversions, 0);
    const prevMkSessions = prev.mediums.filter((m) => isMkMedium(m.medium)).reduce((a, m) => a + m.sessions, 0);
    const prevMkConversions = prev.mediums
      .filter((m) => isMkMedium(m.medium))
      .reduce((a, m) => a + m.conversions, 0);
    const mkConvRate = mkSessions ? mkConversions / mkSessions : 0;
    const prevMkConvRate = prevMkSessions ? prevMkConversions / prevMkSessions : 0;

    // Attributed-revenue trend (current window vs previous, aligned on one axis).
    let bStart = range.start;
    let bGran = range.granularity;
    if (range.days === 0) {
      const ts = curEvents.map(evTime).filter(Number.isFinite);
      bStart = ts.length ? Math.min(...ts) : range.end - 30 * DAY;
      bGran = range.end - bStart > 120 * DAY ? "month" : "day";
    }
    const buckets = buildBuckets(bStart, range.end, bGran);
    const offset = range.start - range.prevStart;
    const trend = buckets.map((b) => {
      let curV = 0;
      let prevV = 0;
      for (const o of mkOrders) {
        const t = evTime(o);
        if (t >= b.start && t < b.end) curV += grossOf(o);
      }
      if (range.compareEnabled) {
        for (const o of prevOrders) {
          if (!orderIsMarketing(o)) continue;
          const t = evTime(o) + offset;
          if (t >= b.start && t < b.end) prevV += grossOf(o);
        }
      }
      return { label: b.label, current: Math.round(curV), previous: Math.round(prevV) };
    });
    const revSpark = trend.map((t) => t.current);

    // Source / medium / campaign breakdowns (top N).
    const bySource = cur.sources.slice(0, 8).map((s) => ({
      name: s.source,
      sessions: s.sessions,
      orders: s.conversions,
    }));
    const byMedium = cur.mediums
      .slice()
      .sort((a, b) => b.revenue - a.revenue || b.sessions - a.sessions)
      .slice(0, 7)
      .map((m) => ({ name: m.medium || "(none)", value: Math.round(m.revenue) || m.sessions, sessions: m.sessions, revenue: m.revenue }));
    const convByCampaign = cur.campaigns
      .filter((c) => c.sessions >= 2)
      .sort((a, b) => b.conversionRate - a.conversionRate)
      .slice(0, 8)
      .map((c) => ({ name: c.campaign, rate: +(c.conversionRate * 100).toFixed(1), orders: c.conversions }));

    const referrers = referrerTable(curEvents);

    return {
      currency,
      summary: cur,
      mkRevenue,
      prevMkRevenue,
      mkOrderCount,
      prevMkOrderCount,
      totalRevenue,
      attributedShare,
      prevAttributedShare:
        prevOrders.reduce((a, o) => a + grossOf(o), 0) > 0
          ? prevMkRevenue / prevOrders.reduce((a, o) => a + grossOf(o), 0)
          : 0,
      mkSessions,
      prevMkSessions,
      mkConversions,
      prevMkConversions,
      mkConvRate,
      prevMkConvRate,
      trend,
      revSpark,
      bySource,
      byMedium,
      convByCampaign,
      referrers,
    };
  }, [events, orders, range]);

  const m = model;
  const money = (v: number) => fmtMoney(v, m.currency);
  const empty = m.summary.sessions === 0 && m.totalRevenue === 0;

  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        icon={<Megaphone className="h-5 w-5 text-primary" />}
        title="Marketing"
        subtitle="Sales attributed to marketing channels, sessions & conversions by UTM source / medium / campaign, conversion rate per campaign, and the top first-touch referrers — for the selected range, vs the previous period."
        seeded={seeded}
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {empty ? (
        <Empty
          icon={<Megaphone className="h-8 w-8" />}
          title="No marketing telemetry in this range"
          hint="Attributed sales & campaign performance appear once sessions land with utm_* params (or a stamped source) inside the selected window."
        />
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="Attributed sales"
              icon={<DollarSign className="h-3.5 w-3.5" />}
              color={PALETTE.revenue}
              value={money(m.mkRevenue)}
              delta={deltaOf(m.mkRevenue, m.prevMkRevenue)}
              spark={m.revSpark}
            />
            <KpiCard
              label="% of revenue"
              icon={<Percent className="h-3.5 w-3.5" />}
              color={PALETTE.amber}
              value={fmtPct(m.attributedShare)}
              delta={deltaOf(m.attributedShare, m.prevAttributedShare)}
              sub="marketing share of total sales"
            />
            <KpiCard
              label="Marketing sessions"
              icon={<Users className="h-3.5 w-3.5" />}
              color={PALETTE.primary}
              value={fmtNum(m.mkSessions)}
              delta={deltaOf(m.mkSessions, m.prevMkSessions)}
            />
            <KpiCard
              label="Marketing orders"
              icon={<Target className="h-3.5 w-3.5" />}
              color={PALETTE.ok}
              value={fmtNum(m.mkConversions)}
              delta={deltaOf(m.mkConversions, m.prevMkConversions)}
            />
            <KpiCard
              label="Conv. rate"
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              color={PALETTE.violet}
              value={fmtPct(m.mkConvRate)}
              delta={deltaOf(m.mkConvRate, m.prevMkConvRate)}
              sub="marketing sessions → order"
            />
            <KpiCard
              label="Tagged sessions"
              icon={<MousePointerClick className="h-3.5 w-3.5" />}
              color={PALETTE.rose}
              value={fmtPct(m.summary.sessions ? m.summary.taggedSessions / m.summary.sessions : 0)}
              sub={`${fmtNum(m.summary.taggedSessions)} of ${fmtNum(m.summary.sessions)} sessions`}
            />
          </div>

          {/* Attributed revenue trend */}
          <ChartCard
            title="Attributed sales over time"
            desc="Revenue from marketing-attributed orders, current range vs the previous period."
            right={<CompareLegend />}
          >
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={m.trend} margin={{ top: 8, right: 8, left: -8, bottom: 4 }}>
                <defs>
                  <linearGradient id="mkRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PALETTE.revenue} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={PALETTE.revenue} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={20} />
                <YAxis
                  tick={AXIS}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(v) => fmtNum(Number(v))}
                />
                <Tooltip {...TOOLTIP} formatter={(v: number) => money(Number(v))} />
                {range.compareEnabled && (
                  <Area
                    type="monotone"
                    dataKey="previous"
                    name="Previous"
                    stroke={PALETTE.compare}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    fill="none"
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="current"
                  name="Attributed sales"
                  stroke={PALETTE.revenue}
                  strokeWidth={2}
                  fill="url(#mkRev)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Source + medium */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title="Sessions vs orders by UTM source"
              desc="Traffic and conversions attributed to each acquisition source."
            >
              {m.bySource.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">No UTM-tagged sources.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={m.bySource} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={AXIS}
                      tickLine={false}
                      axisLine={{ stroke: GRID }}
                      interval={0}
                      angle={-18}
                      textAnchor="end"
                      height={54}
                    />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
                    <Tooltip {...TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: 11, color: AXIS.fill }} />
                    <Bar dataKey="sessions" name="Sessions" fill={PALETTE.primary} radius={[3, 3, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="orders" name="Orders" fill={PALETTE.ok} radius={[3, 3, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Revenue by medium" desc="Share of attributed revenue per channel type.">
              {m.byMedium.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">No medium data.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={m.byMedium}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={96}
                      paddingAngle={2}
                      stroke="hsl(220 8% 7%)"
                    >
                      {m.byMedium.map((_, i) => (
                        <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...TOOLTIP} formatter={(v: number) => money(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 11, color: AXIS.fill }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Conversion by campaign + campaign table */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title="Conversion rate by campaign"
              desc="Best-converting campaigns (≥2 sessions), sessions → order."
            >
              {m.convByCampaign.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Need ≥2 sessions on a campaign to rank conversion rate.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={m.convByCampaign} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                    <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} unit="%" />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={AXIS}
                      tickLine={false}
                      axisLine={false}
                      width={112}
                    />
                    <Tooltip {...TOOLTIP} formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="rate" name="Conv. rate" radius={[0, 3, 3, 0]} maxBarSize={22}>
                      {m.convByCampaign.map((_, i) => (
                        <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Top campaigns"
              desc="Sessions, orders and attributed revenue per campaign."
              right={<Badge variant="muted">{m.summary.campaigns.length} total</Badge>}
            >
              {m.summary.campaigns.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">No campaign-tagged traffic.</div>
              ) : (
                <div className="max-h-[280px] overflow-y-auto pr-1">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Campaign</TH>
                        <TH>Source</TH>
                        <TH className="text-right">Sessions</TH>
                        <TH className="text-right">Orders</TH>
                        <TH className="text-right">Conv.</TH>
                        <TH className="text-right">Revenue</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {m.summary.campaigns.slice(0, 12).map((c) => (
                        <TR key={c.key}>
                          <TD className="max-w-[150px] truncate font-medium" title={c.campaign}>
                            {c.campaign}
                          </TD>
                          <TD>
                            <span className="text-muted-foreground">{c.source}</span>
                            <Badge variant="muted" className="ml-1.5">
                              {c.medium}
                            </Badge>
                          </TD>
                          <TD className="text-right tabular-nums">{fmtNum(c.sessions)}</TD>
                          <TD className="text-right tabular-nums">{fmtNum(c.conversions)}</TD>
                          <TD className="text-right">
                            <Badge variant={c.conversionRate >= 0.05 ? "ok" : c.conversionRate > 0 ? "warn" : "muted"}>
                              {fmtPct(c.conversionRate)}
                            </Badge>
                          </TD>
                          <TD className="text-right tabular-nums font-medium">{c.revenue ? money(c.revenue) : "—"}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </ChartCard>
          </div>

          {/* Top referrers */}
          <ChartCard
            title="Top referrers"
            desc="First-touch referrer of each session — where visitors came from before landing."
            right={
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Radio className="h-3.5 w-3.5" /> first-touch
              </span>
            }
          >
            {m.referrers.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No referrer data in this range.</div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Referrer</TH>
                    <TH className="text-right">Sessions</TH>
                    <TH>Share</TH>
                    <TH className="text-right">Orders</TH>
                    <TH className="text-right">Conv. rate</TH>
                    <TH className="text-right">Revenue</TH>
                  </TR>
                </THead>
                <TBody>
                  {m.referrers.slice(0, 12).map((r, i) => {
                    const maxSess = m.referrers[0]?.sessions || 1;
                    const conv = r.sessions ? r.orders / r.sessions : 0;
                    return (
                      <TR key={r.ref}>
                        <TD>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                            />
                            <span className="font-medium">{r.ref}</span>
                          </div>
                        </TD>
                        <TD className="text-right tabular-nums">{fmtNum(r.sessions)}</TD>
                        <TD className="w-[160px]">
                          <MeterBar value={r.sessions} max={maxSess} />
                        </TD>
                        <TD className="text-right tabular-nums">{fmtNum(r.orders)}</TD>
                        <TD className="text-right">
                          <Badge variant={conv >= 0.05 ? "ok" : conv > 0 ? "warn" : "muted"}>{fmtPct(conv)}</Badge>
                        </TD>
                        <TD className="text-right tabular-nums text-muted-foreground">
                          {r.revenue ? money(r.revenue) : "—"}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </ChartCard>
        </>
      )}
    </div>
  );
}

export default MarketingReport;
