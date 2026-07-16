/**
 * PageAnalytics(pageUrl) — the page drill-down.
 *
 * One page (matched by normalised path), scoped to the GLOBAL date range with
 * vs-previous deltas: KPIs (pageviews, sessions, entrances, exits, exit-rate,
 * avg scroll depth, clicks, conversions), a pageviews time chart, a scroll-depth
 * distribution, the top clicked elements, and the page's click heatmap.
 */
import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AreaChart } from "recharts";
import {
  Eye,
  Users,
  LogIn,
  LogOut,
  MoveVertical,
  MousePointerClick,
  ShoppingCart,
  Flame,
  Percent,
  Gauge,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import { useDateRange } from "../reports/dateRange";
import { ClickHeatmap } from "../ClickHeatmap";
import {
  AXIS,
  Bar,
  Block,
  DC,
  EmptyNote,
  GRID,
  StatGrid,
  TOOLTIP_LABEL,
  TOOLTIP_STYLE,
  compact,
  dayKey,
  dayLabel,
  isClick,
  isOrderEvent,
  isPageView,
  metaOf,
  metaPick,
  nf,
  pagePath,
  pctDelta,
  pctStr,
  scopeToRange,
  sessionOf,
  str,
  timeOf,
  toNum,
  type Stat,
} from "./detailKit";

export interface PageAnalyticsProps {
  url: string;
  title?: string;
  events: TelemetryEvent[];
  orders: Order[];
  config: AppConfig;
}

function normPath(url: string): string {
  const raw = str(url).trim();
  if (!raw) return "(unknown)";
  try {
    const u = new URL(raw, "http://x");
    let p = u.pathname || "/";
    if (p.length > 1) p = p.replace(/\/+$/, "") || "/";
    return p;
  } catch {
    return raw.split(/[?#]/)[0] || "/";
  }
}

interface PageMetrics {
  pageviews: number;
  sessions: number;
  entrances: number;
  exits: number;
  bounces: number;
  clicks: number;
  conversions: number;
  scrollSum: number;
  scrollN: number;
  exitRate: number;
  bounceRate: number;
  avgScroll: number;
}

function buildMetrics(events: TelemetryEvent[], wantPath: string): PageMetrics {
  // Group all events by session to compute entry/exit relative to the whole visit.
  interface S {
    evs: { t: number; path: string; order: boolean }[];
  }
  const sessions = new Map<string, S>();
  events.forEach((e, i) => {
    const sk = sessionOf(e, i);
    let s = sessions.get(sk);
    if (!s) sessions.set(sk, (s = { evs: [] }));
    s.evs.push({ t: timeOf(e), path: pagePath(e), order: isOrderEvent(e) });
  });

  let pageviews = 0;
  let clicks = 0;
  let scrollSum = 0;
  let scrollN = 0;
  for (const e of events) {
    if (pagePath(e) !== wantPath) continue;
    if (isPageView(e)) pageviews++;
    if (isClick(e)) clicks++;
    const name = String(e.event ?? e.eventType ?? "").toLowerCase();
    if (/scroll/.test(name)) {
      const d = toNum(metaPick(metaOf(e), "depth", "scrollDepth", "percent", "maxDepth")) || toNum(e.y);
      if (d > 0) {
        scrollSum += Math.min(100, d);
        scrollN++;
      }
    }
  }

  let touched = 0;
  let entrances = 0;
  let exits = 0;
  let bounces = 0;
  let conversions = 0;
  for (const s of sessions.values()) {
    const ordered = s.evs.filter((x) => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
    const list = ordered.length ? ordered : s.evs;
    if (!list.some((x) => x.path === wantPath)) continue;
    touched++;
    const first = list[0]?.path;
    const last = list[list.length - 1]?.path;
    if (first === wantPath) entrances++;
    if (last === wantPath) exits++;
    const onlyThis = list.every((x) => x.path === wantPath);
    if (first === wantPath && onlyThis) bounces++;
    if (list.some((x) => x.order)) conversions++;
  }

  return {
    pageviews,
    sessions: touched,
    entrances,
    exits,
    bounces,
    clicks,
    conversions,
    scrollSum,
    scrollN,
    exitRate: touched ? exits / touched : 0,
    bounceRate: entrances ? bounces / entrances : 0,
    avgScroll: scrollN ? scrollSum / scrollN : 0,
  };
}

function buildPvSeries(events: TelemetryEvent[], wantPath: string) {
  const m = new Map<string, number>();
  for (const e of events) {
    if (pagePath(e) !== wantPath || !isPageView(e)) continue;
    const d = dayKey(str(e.timestamp));
    if (d) m.set(d, (m.get(d) ?? 0) + 1);
  }
  const days = [...m.keys()].sort();
  if (!days.length) return [];
  const out: { label: string; pageviews: number }[] = [];
  const DAYMS = 86_400_000;
  let cur = Date.parse(`${days[0]}T00:00:00Z`);
  const end = Date.parse(`${days[days.length - 1]}T00:00:00Z`);
  for (let i = 0; cur <= end && i < 400; cur += DAYMS, i++) {
    const day = new Date(cur).toISOString().slice(0, 10);
    out.push({ label: dayLabel(day), pageviews: m.get(day) ?? 0 });
  }
  return out;
}

function scrollBuckets(events: TelemetryEvent[], wantPath: string) {
  const buckets = [
    { label: "0–25%", count: 0 },
    { label: "25–50%", count: 0 },
    { label: "50–75%", count: 0 },
    { label: "75–100%", count: 0 },
  ];
  const seen = new Map<string, number>(); // deepest depth per session
  events.forEach((e, i) => {
    if (pagePath(e) !== wantPath) return;
    const name = String(e.event ?? e.eventType ?? "").toLowerCase();
    if (!/scroll/.test(name)) return;
    const d = toNum(metaPick(metaOf(e), "depth", "scrollDepth", "percent", "maxDepth")) || toNum(e.y);
    if (d <= 0) return;
    const sk = sessionOf(e, i);
    seen.set(sk, Math.max(seen.get(sk) ?? 0, Math.min(100, d)));
  });
  for (const d of seen.values()) {
    const idx = d >= 75 ? 3 : d >= 50 ? 2 : d >= 25 ? 1 : 0;
    buckets[idx].count++;
  }
  return { buckets, total: seen.size };
}

function topElements(events: TelemetryEvent[], wantPath: string) {
  const m = new Map<string, { label: string; count: number }>();
  for (const e of events) {
    if (pagePath(e) !== wantPath || !isClick(e)) continue;
    const label = str(e.elementText) || str(e.elementId) || "(unlabeled)";
    const key = label.toLowerCase();
    let r = m.get(key);
    if (!r) m.set(key, (r = { label, count: 0 }));
    r.count++;
  }
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}

export function PageAnalytics({ url, title, events, orders, config }: PageAnalyticsProps) {
  const range = useDateRange();
  const wantPath = useMemo(() => normPath(url), [url]);
  const scoped = useMemo(() => scopeToRange(events, orders, range), [events, orders, range]);
  const compare = range.compareEnabled;

  const cur = useMemo(() => buildMetrics(scoped.cur.events, wantPath), [scoped, wantPath]);
  const prev = useMemo(() => buildMetrics(scoped.prev.events, wantPath), [scoped, wantPath]);
  const pv = useMemo(() => buildPvSeries(scoped.cur.events, wantPath), [scoped, wantPath]);
  const scroll = useMemo(() => scrollBuckets(scoped.cur.events, wantPath), [scoped, wantPath]);
  const elements = useMemo(() => topElements(scoped.cur.events, wantPath), [scoped, wantPath]);
  const pageEvents = useMemo(() => scoped.cur.events.filter((e) => pagePath(e) === wantPath), [scoped, wantPath]);

  const stats: Stat[] = [
    { label: "Pageviews", value: nf(cur.pageviews), icon: <Eye className="h-3.5 w-3.5" />, color: DC.views, delta: pctDelta(cur.pageviews, prev.pageviews) },
    { label: "Sessions", value: nf(cur.sessions), icon: <Users className="h-3.5 w-3.5" />, color: DC.sessions, delta: pctDelta(cur.sessions, prev.sessions) },
    { label: "Entrances", value: nf(cur.entrances), icon: <LogIn className="h-3.5 w-3.5" />, color: DC.cart, delta: pctDelta(cur.entrances, prev.entrances) },
    { label: "Exits", value: nf(cur.exits), icon: <LogOut className="h-3.5 w-3.5" />, color: DC.rate, delta: pctDelta(cur.exits, prev.exits), invert: true, sub: `${pctStr(cur.exitRate * 100)} exit rate` },
    { label: "Bounce rate", value: pctStr(cur.bounceRate * 100), icon: <Gauge className="h-3.5 w-3.5" />, color: DC.rate, delta: pctDelta(cur.bounceRate, prev.bounceRate), invert: true },
    { label: "Avg scroll", value: pctStr(cur.avgScroll, 0), icon: <MoveVertical className="h-3.5 w-3.5" />, color: DC.scroll, delta: pctDelta(cur.avgScroll, prev.avgScroll) },
    { label: "Clicks", value: nf(cur.clicks), icon: <MousePointerClick className="h-3.5 w-3.5" />, color: DC.clicks, delta: pctDelta(cur.clicks, prev.clicks) },
    { label: "Conversions", value: nf(cur.conversions), icon: <ShoppingCart className="h-3.5 w-3.5" />, color: DC.orders, delta: pctDelta(cur.conversions, prev.conversions) },
  ];

  const maxEl = Math.max(...elements.map((e) => e.count), 1);

  return (
    <div className="flex flex-col gap-4">
      <StatGrid stats={stats} compare={compare} cols={4} />

      <Block title="Pageviews over time" icon={<Eye className="h-4 w-4 text-primary" />} desc={`Daily pageviews for ${wantPath}.`}>
        {pv.length ? (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pv} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="pg-pv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={DC.views} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={DC.views} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={34} tickFormatter={compact} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} formatter={(v: number) => [nf(v), "Pageviews"]} />
                <Area type="monotone" dataKey="pageviews" name="Pageviews" stroke={DC.views} strokeWidth={2} fill="url(#pg-pv)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyNote>No pageviews to chart in range.</EmptyNote>
        )}
      </Block>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Block title="Scroll depth" icon={<MoveVertical className="h-4 w-4 text-primary" />} desc="How far sessions scrolled (deepest reach per session).">
          {scroll.total ? (
            <div className="flex flex-col gap-2.5">
              {scroll.buckets.map((b) => {
                const pctv = scroll.total ? (b.count / scroll.total) * 100 : 0;
                return (
                  <div key={b.label} className="flex items-center gap-3">
                    <div className="w-20 shrink-0 text-xs font-medium text-foreground">{b.label}</div>
                    <div className="flex-1">
                      <Bar value={b.count} max={scroll.total} color={DC.scroll} />
                    </div>
                    <div className="w-24 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {nf(b.count)} · {pctStr(pctv, 0)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyNote>No scroll telemetry for this page.</EmptyNote>
          )}
        </Block>

        <Block title="Top clicked elements" icon={<MousePointerClick className="h-4 w-4 text-primary" />} desc="Most-clicked elements on this page.">
          {elements.length ? (
            <div className="flex flex-col gap-2.5">
              {elements.map((el) => (
                <div key={el.label} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 truncate text-xs font-medium text-foreground" title={el.label}>
                    {el.label}
                  </div>
                  <div className="flex-1">
                    <Bar value={el.count} max={maxEl} color={DC.clicks} />
                  </div>
                  <div className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">{nf(el.count)}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyNote>No click telemetry for this page.</EmptyNote>
          )}
        </Block>
      </div>

      <Block title="Click heatmap" icon={<Flame className="h-4 w-4 text-down" />} desc={`Click density on ${wantPath}.`}>
        <ClickHeatmap events={pageEvents} />
      </Block>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Percent className="h-3.5 w-3.5" />
        <span>Page</span>
        <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{wantPath}</code>
        {title && <span>· {title}</span>}
      </div>
    </div>
  );
}
