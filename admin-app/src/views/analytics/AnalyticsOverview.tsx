/**
 * AnalyticsOverview — the polished landing page for the Analytics section.
 *
 * A top-level KPI dashboard derived from the STABLE Telemetry + Orders sheets
 * (via `useAnalyticsData`, which transparently falls back to the deterministic
 * seed so the page renders before the read endpoint is deployed):
 *   • six headline stat tiles (sessions, unique visitors, clicks, conversions,
 *     revenue, conversion-rate) each with an inline sparkline + week-over-week
 *     delta,
 *   • a main multi-series time chart (sessions vs conversions vs revenue),
 *   • top pages and top products leaderboards,
 *   • a live-activity strip of the most recent events.
 *
 * All metrics respect a window selector (7 / 14 / 30 days / all). Everything is
 * memoised off the raw event/order arrays so refreshes are cheap. This page has
 * no positional overlay, so the x/y pixel→% normalisation the heatmaps need is
 * intentionally not applied here.
 */
import { useId, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  DollarSign,
  Eye,
  FileText,
  Gauge,
  LayoutDashboard,
  MousePointerClick,
  MoveVertical,
  Package,
  Search,
  ShoppingCart,
  Target,
  Users,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import { buildLeaderboard, type LeaderRow } from "@/lib/leaderboard";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader, MeterBar } from "./shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { fmtMoney, timeAgo } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* palette — one categorical set, harmonised for the dark admin theme         */
/* -------------------------------------------------------------------------- */
const C = {
  sessions: "hsl(203 89% 60%)", // blue
  visitors: "hsl(258 82% 68%)", // violet
  clicks: "hsl(190 80% 52%)", // cyan
  conversions: "hsl(142 62% 45%)", // green (ok)
  revenue: "hsl(38 92% 55%)", // amber (warn)
  rate: "hsl(4 72% 58%)", // primary red
};
const AXIS = { fill: "#9aa0a6", fontSize: 11 };
const GRID = "hsl(220 6% 16%)";
const DAY = 86_400_000;

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */
const nf = (n: number) => Math.round(n).toLocaleString("en-US");
const compact = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v));

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function orderValue(o: Order): number {
  return toNum(o.price) * (toNum(o.quantity) || 1);
}

/** UTC day key (YYYY-MM-DD) — matches the rest of the analytics layer. */
function dayKey(ts?: string): string {
  const t = Date.parse(ts ?? "");
  if (Number.isNaN(t)) return "";
  return new Date(t).toISOString().slice(0, 10);
}

function dayLabel(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t)) return day;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function pathOf(url?: string): string {
  if (!url) return "(unknown)";
  try {
    const u = new URL(String(url));
    return u.pathname || "/";
  } catch {
    const stripped = String(url).replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0];
    return stripped || String(url);
  }
}

const PAGE_VIEW_RE = /page_?view|screen_?view|visit|session_?start|impression/;
const CLICK_RE = /(^|_)click|tap|press|add_?to_?cart|cart_?add|select_?item|cta/;

function isPageView(e: TelemetryEvent): boolean {
  const name = String(e.event ?? e.eventType ?? "").toLowerCase();
  return PAGE_VIEW_RE.test(name);
}
function isClick(e: TelemetryEvent): boolean {
  const type = String(e.eventType ?? "").toLowerCase();
  if (type === "click") return true;
  return CLICK_RE.test(String(e.event ?? "").toLowerCase());
}
function sessKey(e: TelemetryEvent): string {
  return String(e.sessionId ?? e.anonymousId ?? "");
}

/* -------------------------------------------------------------------------- */
/* derivations                                                                 */
/* -------------------------------------------------------------------------- */
interface DayRow {
  day: string;
  label: string;
  sessions: number;
  visitors: number;
  clicks: number;
  pageViews: number;
  conversions: number;
  revenue: number;
  rate: number; // conversions / sessions * 100
}

interface Totals {
  sessions: number;
  visitors: number;
  clicks: number;
  conversions: number;
  revenue: number;
  rate: number; // %
  currency: string;
}

interface Derived {
  series: DayRow[];
  totals: Totals;
  deltas: Record<keyof Omit<Totals, "currency">, number | null>;
}

/** Filter events + orders to the trailing window (0 = all time). */
function windowSlice(
  events: TelemetryEvent[],
  orders: Order[],
  windowDays: number,
): { events: TelemetryEvent[]; orders: Order[] } {
  if (!windowDays) return { events, orders };
  const cutoff = Date.now() - windowDays * DAY;
  const okTs = (ts?: string) => {
    const t = Date.parse(ts ?? "");
    return Number.isNaN(t) ? true : t >= cutoff;
  };
  return {
    events: events.filter((e) => okTs(e.timestamp)),
    orders: orders.filter((o) => okTs(o.timestamp)),
  };
}

function buildDerived(events: TelemetryEvent[], orders: Order[]): Derived {
  const sess = new Map<string, Set<string>>();
  const vis = new Map<string, Set<string>>();
  const clicks = new Map<string, number>();
  const pv = new Map<string, number>();
  const conv = new Map<string, number>();
  const rev = new Map<string, number>();
  const allSess = new Set<string>();
  const allVis = new Set<string>();
  let totalClicks = 0;
  const days = new Set<string>();

  const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
  const bumpSet = (m: Map<string, Set<string>>, k: string, v: string) => {
    if (!v) return;
    let s = m.get(k);
    if (!s) m.set(k, (s = new Set()));
    s.add(v);
  };

  for (const e of events) {
    const d = dayKey(e.timestamp);
    if (!d) continue;
    days.add(d);
    const sk = sessKey(e);
    if (sk) {
      bumpSet(sess, d, sk);
      allSess.add(sk);
    }
    const an = String(e.anonymousId ?? "");
    if (an) {
      bumpSet(vis, d, an);
      allVis.add(an);
    }
    if (isPageView(e)) bump(pv, d);
    if (isClick(e)) {
      bump(clicks, d);
      totalClicks++;
    }
  }

  let currency = "USD";
  let totalRevenue = 0;
  for (const o of orders) {
    const d = dayKey(o.timestamp);
    if (!d) continue;
    days.add(d);
    bump(conv, d);
    const val = orderValue(o);
    bump(rev, d, val);
    totalRevenue += val;
    if (o.currency) currency = String(o.currency);
  }

  // Continuous, ascending day axis (capped so an unbounded window stays sane).
  const sorted = [...days].sort();
  const series: DayRow[] = [];
  if (sorted.length) {
    let cur = Date.parse(`${sorted[0]}T00:00:00Z`);
    const end = Date.parse(`${sorted[sorted.length - 1]}T00:00:00Z`);
    const guard = 400; // hard cap on rows
    for (let i = 0; cur <= end && i < guard; cur += DAY, i++) {
      const day = new Date(cur).toISOString().slice(0, 10);
      const s = sess.get(day)?.size ?? 0;
      const cvn = conv.get(day) ?? 0;
      series.push({
        day,
        label: dayLabel(day),
        sessions: s,
        visitors: vis.get(day)?.size ?? 0,
        clicks: clicks.get(day) ?? 0,
        pageViews: pv.get(day) ?? 0,
        conversions: cvn,
        revenue: rev.get(day) ?? 0,
        rate: s ? (cvn / s) * 100 : 0,
      });
    }
  }

  const totalConversions = [...conv.values()].reduce((a, b) => a + b, 0);
  const totals: Totals = {
    sessions: allSess.size,
    visitors: allVis.size,
    clicks: totalClicks,
    conversions: totalConversions,
    revenue: totalRevenue,
    rate: allSess.size ? (totalConversions / allSess.size) * 100 : 0,
    currency,
  };

  // Week-over-week: last 7 rows vs the 7 before them.
  const sumLast = (key: keyof DayRow, from: number, to: number) =>
    series.slice(from, to).reduce((a, r) => a + (r[key] as number), 0);
  const n = series.length;
  const wow = (key: keyof DayRow): number | null => {
    if (n < 2) return null;
    const last = sumLast(key, Math.max(0, n - 7), n);
    const prev = sumLast(key, Math.max(0, n - 14), Math.max(0, n - 7));
    if (prev === 0) return last > 0 ? null : 0;
    return (last - prev) / prev;
  };
  // Rate delta is a ratio-of-ratios: last-7 conv/sess vs prior-7.
  const rateWow = (): number | null => {
    if (n < 2) return null;
    const ls = sumLast("sessions", Math.max(0, n - 7), n);
    const lc = sumLast("conversions", Math.max(0, n - 7), n);
    const ps = sumLast("sessions", Math.max(0, n - 14), Math.max(0, n - 7));
    const pc = sumLast("conversions", Math.max(0, n - 14), Math.max(0, n - 7));
    const lr = ls ? lc / ls : 0;
    const pr = ps ? pc / ps : 0;
    if (pr === 0) return lr > 0 ? null : 0;
    return (lr - pr) / pr;
  };

  return {
    series,
    totals,
    deltas: {
      sessions: wow("sessions"),
      visitors: wow("visitors"),
      clicks: wow("clicks"),
      conversions: wow("conversions"),
      revenue: wow("revenue"),
      rate: rateWow(),
    },
  };
}

interface PageRow {
  path: string;
  views: number;
  sessions: number;
}
function buildTopPages(events: TelemetryEvent[]): PageRow[] {
  const views = new Map<string, number>();
  const sessions = new Map<string, Set<string>>();
  for (const e of events) {
    if (!isPageView(e)) continue;
    const p = pathOf(e.pageUrl);
    views.set(p, (views.get(p) ?? 0) + 1);
    const sk = sessKey(e);
    if (sk) {
      let s = sessions.get(p);
      if (!s) sessions.set(p, (s = new Set()));
      s.add(sk);
    }
  }
  return [...views.entries()]
    .map(([path, v]) => ({ path, views: v, sessions: sessions.get(path)?.size ?? 0 }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 7);
}

/* -------------------------------------------------------------------------- */
/* presentational bits                                                         */
/* -------------------------------------------------------------------------- */

/** Compact gradient-filled sparkline (hand-rolled SVG, no chart lib overhead). */
function Spark({ data, color }: { data: number[]; color: string }) {
  const id = useId().replace(/[:]/g, "");
  const w = 120;
  const h = 34;
  if (data.length < 2 || data.every((v) => v === 0)) {
    return <div className="h-[34px] w-full" aria-hidden />;
  }
  const max = Math.max(...data);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const px = (i: number) => (i / (data.length - 1)) * w;
  const py = (v: number) => h - 3 - ((v - min) / range) * (h - 6);
  const line = data.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = data[data.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-[34px] w-full" aria-hidden>
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sp-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w} cy={py(last)} r={2} fill={color} />
    </svg>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-[11px] font-medium text-muted-foreground">new</span>;
  }
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${up ? "text-ok" : "text-down"}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(value * 100).toFixed(value === 0 ? 0 : Math.abs(value) < 0.1 ? 1 : 0)}%
    </span>
  );
}

function KpiTile({
  label,
  value,
  icon,
  color,
  delta,
  spark,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  delta: number | null;
  spark: number[];
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-border/80">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-70"
        style={{ background: color }}
        aria-hidden
      />
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span style={{ color }}>{icon}</span>
          {label}
        </span>
        <Delta value={delta} />
      </div>
      <div className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums text-foreground">
        {value}
      </div>
      <div className="mt-2">
        <Spark data={spark} color={color} />
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground/70">vs previous 7 days</div>
    </div>
  );
}

const LIVE_ICON: Record<string, React.ReactNode> = {
  order: <ShoppingCart className="h-3.5 w-3.5" />,
  add_to_cart: <ShoppingCart className="h-3.5 w-3.5" />,
  begin_checkout: <CreditCard className="h-3.5 w-3.5" />,
  checkout: <CreditCard className="h-3.5 w-3.5" />,
  search: <Search className="h-3.5 w-3.5" />,
  scroll: <MoveVertical className="h-3.5 w-3.5" />,
  click: <MousePointerClick className="h-3.5 w-3.5" />,
  hover: <Eye className="h-3.5 w-3.5" />,
  page_view: <Eye className="h-3.5 w-3.5" />,
  product_view: <Package className="h-3.5 w-3.5" />,
  ai_outage: <AlertTriangle className="h-3.5 w-3.5 text-down" />,
};

function prettyEvent(name: string): string {
  return name.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function LiveStrip({ events }: { events: TelemetryEvent[] }) {
  const recent = useMemo(() => {
    return [...events]
      .filter((e) => e.timestamp)
      .sort((a, b) => Date.parse(String(b.timestamp)) - Date.parse(String(a.timestamp)))
      .slice(0, 16);
  }, [events]);

  if (recent.length === 0) return null;

  return (
    <div className="flex items-stretch gap-2 overflow-x-auto rounded-xl border border-border bg-card/60 p-2">
      <div className="flex shrink-0 items-center gap-2 rounded-lg bg-secondary px-3">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">Live</span>
      </div>
      {recent.map((e, i) => {
        const name = String(e.event ?? e.eventType ?? "event").toLowerCase();
        const label = String(e.elementText || "").trim() || prettyEvent(name);
        return (
          <div
            key={`${e.timestamp}-${i}`}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-1.5"
            title={`${prettyEvent(name)} · ${pathOf(e.pageUrl)}`}
          >
            <span className="text-muted-foreground">{LIVE_ICON[name] ?? <Activity className="h-3.5 w-3.5" />}</span>
            <div className="min-w-0">
              <div className="max-w-[150px] truncate text-xs font-medium text-foreground">{label}</div>
              <div className="max-w-[150px] truncate text-[10px] text-muted-foreground">
                {pathOf(e.pageUrl)} · {timeAgo(e.timestamp ?? "")}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* main view                                                                   */
/* -------------------------------------------------------------------------- */
const WINDOWS: { key: number; label: string }[] = [
  { key: 7, label: "7d" },
  { key: 14, label: "14d" },
  { key: 30, label: "30d" },
  { key: 0, label: "All" },
];

const pctStr = (v: number) => `${v.toFixed(1)}%`;

export function AnalyticsOverview({ config }: { config: AppConfig }) {
  const { events, orders, seeded, loading, liveCount, refresh } = useAnalyticsData(config);
  const [win, setWin] = useState(14);

  const scoped = useMemo(() => windowSlice(events, orders, win), [events, orders, win]);
  const d = useMemo(() => buildDerived(scoped.events, scoped.orders), [scoped]);
  const pages = useMemo(() => buildTopPages(scoped.events), [scoped]);
  const board = useMemo(
    () => buildLeaderboard(scoped.events, scoped.orders, "revenue"),
    [scoped],
  );
  const topProducts: LeaderRow[] = board.rows.slice(0, 5);

  const cur = d.totals.currency;
  const s = d.series;
  const hasData = s.length > 0;
  const maxPageViews = Math.max(...pages.map((p) => p.views), 1);
  const maxProdRev = Math.max(...topProducts.map((p) => p.revenue), 1);

  const kpis = [
    {
      label: "Sessions",
      value: nf(d.totals.sessions),
      icon: <Activity className="h-3.5 w-3.5" />,
      color: C.sessions,
      delta: d.deltas.sessions,
      spark: s.map((r) => r.sessions),
    },
    {
      label: "Visitors",
      value: nf(d.totals.visitors),
      icon: <Users className="h-3.5 w-3.5" />,
      color: C.visitors,
      delta: d.deltas.visitors,
      spark: s.map((r) => r.visitors),
    },
    {
      label: "Clicks",
      value: nf(d.totals.clicks),
      icon: <MousePointerClick className="h-3.5 w-3.5" />,
      color: C.clicks,
      delta: d.deltas.clicks,
      spark: s.map((r) => r.clicks),
    },
    {
      label: "Conversions",
      value: nf(d.totals.conversions),
      icon: <ShoppingCart className="h-3.5 w-3.5" />,
      color: C.conversions,
      delta: d.deltas.conversions,
      spark: s.map((r) => r.conversions),
    },
    {
      label: "Revenue",
      value: fmtMoney(d.totals.revenue, cur),
      icon: <DollarSign className="h-3.5 w-3.5" />,
      color: C.revenue,
      delta: d.deltas.revenue,
      spark: s.map((r) => r.revenue),
    },
    {
      label: "Conv. rate",
      value: pctStr(d.totals.rate),
      icon: <Gauge className="h-3.5 w-3.5" />,
      color: C.rate,
      delta: d.deltas.rate,
      spark: s.map((r) => r.rate),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<LayoutDashboard className="h-4 w-4 text-primary" />}
        title="Analytics Overview"
        subtitle="Traffic, engagement and revenue at a glance — sessions, conversions and money from the stable Telemetry & Orders sheets. Falls back to seed data until the read endpoint is live."
        seeded={seeded}
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
        right={
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                onClick={() => setWin(w.key)}
                className={
                  "px-2.5 py-1 text-xs font-medium transition-colors " +
                  (win === w.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent")
                }
              >
                {w.label}
              </button>
            ))}
          </div>
        }
      />

      <LiveStrip events={scoped.events} />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <KpiTile key={k.label} {...k} />
        ))}
      </div>

      {/* Main multi-series time chart */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Sessions, conversions &amp; revenue</CardTitle>
            <p className="text-xs text-muted-foreground">Daily trend across the selected window.</p>
          </div>
          <div className="hidden items-center gap-3 text-[11px] text-muted-foreground sm:flex">
            <LegendDot color={C.sessions} label="Sessions" />
            <LegendDot color={C.conversions} label="Conversions" />
            <LegendDot color={C.revenue} label="Revenue" />
          </div>
        </CardHeader>
        <CardContent>
          {!hasData ? (
            <Empty icon={<Target className="h-8 w-8" />} title="No dated telemetry to chart yet" />
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={s} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="ov-sessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.sessions} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={C.sessions} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ov-revenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.revenue} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={C.revenue} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={AXIS}
                    tickLine={false}
                    axisLine={{ stroke: GRID }}
                    minTickGap={24}
                  />
                  <YAxis
                    yAxisId="count"
                    tick={AXIS}
                    tickLine={false}
                    axisLine={false}
                    width={38}
                    tickFormatter={compact}
                  />
                  <YAxis
                    yAxisId="rev"
                    orientation="right"
                    tick={AXIS}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={compact}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(220 8% 7%)",
                      border: "1px solid hsl(220 6% 16%)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#e8e8e8", marginBottom: 2 }}
                    itemStyle={{ padding: 0 }}
                    formatter={(value: number, name: string) => {
                      if (name === "Revenue") return [fmtMoney(value, cur), name];
                      return [nf(value), name];
                    }}
                  />
                  <Area
                    yAxisId="rev"
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke={C.revenue}
                    strokeWidth={1.5}
                    fill="url(#ov-revenue)"
                  />
                  <Area
                    yAxisId="count"
                    type="monotone"
                    dataKey="sessions"
                    name="Sessions"
                    stroke={C.sessions}
                    strokeWidth={2}
                    fill="url(#ov-sessions)"
                  />
                  <Line
                    yAxisId="count"
                    type="monotone"
                    dataKey="conversions"
                    name="Conversions"
                    stroke={C.conversions}
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top pages + top products */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" /> Top pages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pages.length === 0 ? (
              <Empty icon={<FileText className="h-7 w-7" />} title="No page views yet" />
            ) : (
              <div className="flex flex-col gap-2.5">
                {pages.map((p) => (
                  <div key={p.path} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 truncate font-mono text-xs text-foreground" title={p.path}>
                      {p.path}
                    </div>
                    <div className="flex-1">
                      <MeterBar value={p.views} max={maxPageViews} tone="primary" />
                    </div>
                    <div className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">
                      {nf(p.views)}
                    </div>
                    <div className="hidden w-20 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:block">
                      {nf(p.sessions)} sess.
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" /> Top products
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <Empty icon={<Package className="h-7 w-7" />} title="No product telemetry yet" />
            ) : (
              <div className="flex flex-col gap-2.5">
                {topProducts.map((p, i) => (
                  <div key={p.productId} className="flex items-center gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-[11px] font-semibold tabular-nums text-muted-foreground">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground" title={p.name}>
                        {p.name}
                      </div>
                      <div className="mt-1">
                        <MeterBar value={p.revenue} max={maxProdRev} tone="ok" />
                      </div>
                    </div>
                    <div className="w-16 shrink-0 text-right">
                      <div className="text-sm font-semibold tabular-nums text-foreground">
                        {p.revenue ? fmtMoney(p.revenue, p.currency) : "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{nf(p.views)} views</div>
                    </div>
                    <Badge
                      variant={p.viewToBuy >= 0.05 ? "ok" : p.viewToBuy > 0 ? "warn" : "muted"}
                      className="hidden shrink-0 tabular-nums sm:inline-flex"
                    >
                      {pctStr(p.viewToBuy * 100)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
