/**
 * TRAFFIC & ENGAGEMENT report — sessions, visitors, pageviews, engagement rate
 * and top pages for the globally-selected date range, each vs the previous
 * period.
 *
 * Self-fetches the STABLE Telemetry sheet via `useAnalyticsData`
 * (deterministic-seed fallback) and consumes the GLOBAL date-range/compare
 * context: the sessions trend overlays the previous period and every KPI shows
 * its delta. Recharts + the shared admin chart theme.
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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Users, UserPlus, Eye, Activity, MousePointerClick, Timer, Globe } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { TelemetryEvent } from "@/lib/ecommerce";
import {
  evName,
  evType,
  metaOf,
  metaPick,
  pagePath,
  pick,
  sessionOf,
  str,
  timeOf,
} from "@/lib/telemetryFields";
import { useAnalyticsData } from "../useAnalyticsData";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { MeterBar } from "../shell";
import { useDateRange } from "./dateRange";
import {
  AXIS,
  GRID,
  TOOLTIP,
  PALETTE,
  SERIES_COLORS,
  KpiCard,
  ChartCard,
  ReportEmpty,
  ReportHeader,
  CompareLegend,
  buildBuckets,
  deltaOf,
  fmtNum,
  fmtPct,
} from "./reportKit";

function deviceOf(e: TelemetryEvent): string {
  const m = metaOf(e);
  const d = str(metaPick(m, "device", "deviceType", "platform")).toLowerCase();
  if (d) return d;
  const ua = str(pick(e, "userAgent", "user_agent")).toLowerCase();
  if (!ua) return "unknown";
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobi|iphone|android/.test(ua)) return "mobile";
  return "desktop";
}

const anonOf = (e: TelemetryEvent, i: number): string =>
  str(pick(e, "anonymousId", "anonymous_id")) || sessionOf(e, i);

const isView = (e: TelemetryEvent): boolean => {
  const n = evName(e);
  const t = evType(e);
  return /view|page|pageview|impression|land/.test(n) || /page|view/.test(t);
};

interface Metrics {
  sessions: number;
  visitors: number;
  pageviews: number;
  events: number;
  engagement: number; // events per session
  avgDurationS: number;
}

function metricsFor(events: TelemetryEvent[]): Metrics {
  const sessions = new Set<string>();
  const visitors = new Set<string>();
  const first = new Map<string, number>();
  const last = new Map<string, number>();
  let pageviews = 0;
  events.forEach((e, i) => {
    const sid = sessionOf(e, i);
    const t = timeOf(e);
    sessions.add(sid);
    visitors.add(anonOf(e, i));
    if (isView(e)) pageviews++;
    if (Number.isFinite(t)) {
      if (!first.has(sid) || t < (first.get(sid) as number)) first.set(sid, t);
      if (!last.has(sid) || t > (last.get(sid) as number)) last.set(sid, t);
    }
  });
  let durSum = 0;
  let durN = 0;
  for (const sid of sessions) {
    const a = first.get(sid);
    const b = last.get(sid);
    if (a != null && b != null && b > a) {
      durSum += b - a;
      durN++;
    }
  }
  return {
    sessions: sessions.size,
    visitors: visitors.size,
    pageviews: pageviews || events.length,
    events: events.length,
    engagement: sessions.size ? events.length / sessions.size : 0,
    avgDurationS: durN ? durSum / durN / 1000 : 0,
  };
}

function fmtDuration(s: number): string {
  if (!s) return "0s";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}m ${sec}s` : `${sec}s`;
}

export function TrafficReport({ config }: { config: AppConfig }) {
  const { events, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config, { orders: false });
  const range = useDateRange();

  const model = useMemo(() => {
    const cur = events.filter((e) => range.inRange(timeOf(e)));
    const prev = events.filter((e) => range.inPrev(timeOf(e)));
    const curM = metricsFor(cur);
    const prevM = metricsFor(prev);

    // Sessions trend: current vs previous window aligned on one axis.
    const buckets = buildBuckets(range.start, range.end, range.granularity);
    const offset = range.start - range.prevStart;
    const curByBucket = buckets.map(() => new Set<string>());
    const prevByBucket = buckets.map(() => new Set<string>());
    const bIndex = (t: number) => {
      for (let i = 0; i < buckets.length; i++) if (t >= buckets[i].start && t < buckets[i].end) return i;
      return -1;
    };
    cur.forEach((e, i) => {
      const bi = bIndex(timeOf(e));
      if (bi >= 0) curByBucket[bi].add(sessionOf(e, i));
    });
    if (range.compareEnabled) {
      prev.forEach((e, i) => {
        const bi = bIndex(timeOf(e) + offset);
        if (bi >= 0) prevByBucket[bi].add(sessionOf(e, i));
      });
    }
    const trend = buckets.map((b, i) => ({
      label: b.label,
      current: curByBucket[i].size,
      previous: prevByBucket[i].size,
    }));

    // Top pages (by sessions).
    const pageMap = new Map<string, { sessions: Set<string>; views: number }>();
    cur.forEach((e, i) => {
      const p = pagePath(e);
      const rec = pageMap.get(p) ?? { sessions: new Set<string>(), views: 0 };
      rec.sessions.add(sessionOf(e, i));
      if (isView(e)) rec.views++;
      pageMap.set(p, rec);
    });
    const topPages = [...pageMap.entries()]
      .map(([page, r]) => ({ page, sessions: r.sessions.size, views: r.views }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 8);
    const pageMax = topPages[0]?.sessions ?? 1;

    // Device split (by sessions).
    const devMap = new Map<string, Set<string>>();
    cur.forEach((e, i) => {
      const d = deviceOf(e);
      (devMap.get(d) ?? devMap.set(d, new Set<string>()).get(d)!).add(sessionOf(e, i));
    });
    const devices = [...devMap.entries()]
      .map(([name, s]) => ({ name, value: s.size }))
      .sort((a, b) => b.value - a.value);

    // Event mix (by type / name).
    const typeMap = new Map<string, number>();
    for (const e of cur) {
      const key = evType(e) || evName(e) || "other";
      typeMap.set(key, (typeMap.get(key) ?? 0) + 1);
    }
    const eventMix = [...typeMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    return {
      cur: curM,
      prev: prevM,
      trend,
      topPages,
      pageMax,
      devices,
      eventMix,
      hasData: cur.length > 0,
    };
  }, [events, range]);

  const DEVICE_COLOR: Record<string, string> = {
    desktop: PALETTE.primary,
    mobile: PALETTE.ok,
    tablet: PALETTE.amber,
    unknown: PALETTE.muted,
  };

  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        icon={<Users className="h-4 w-4 text-primary" />}
        title="Traffic & engagement"
        subtitle="Sessions, visitors, pageviews and engagement for the selected range — each measured against the previous period."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {isEmpty ? (
        <ReportEmpty icon={<Users className="h-7 w-7" />} />
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiCard
          label="Sessions"
          value={fmtNum(model.cur.sessions)}
          icon={<Activity className="h-3.5 w-3.5" />}
          color={PALETTE.primary}
          delta={deltaOf(model.cur.sessions, model.prev.sessions)}
          spark={model.trend.map((d) => d.current)}
        />
        <KpiCard
          label="Visitors"
          value={fmtNum(model.cur.visitors)}
          icon={<UserPlus className="h-3.5 w-3.5" />}
          color={PALETTE.ok}
          delta={deltaOf(model.cur.visitors, model.prev.visitors)}
        />
        <KpiCard
          label="Pageviews"
          value={fmtNum(model.cur.pageviews)}
          icon={<Eye className="h-3.5 w-3.5" />}
          color={PALETTE.violet}
          delta={deltaOf(model.cur.pageviews, model.prev.pageviews)}
        />
        <KpiCard
          label="Events"
          value={fmtNum(model.cur.events)}
          icon={<MousePointerClick className="h-3.5 w-3.5" />}
          color={PALETTE.amber}
          delta={deltaOf(model.cur.events, model.prev.events)}
        />
        <KpiCard
          label="Events / session"
          value={model.cur.engagement.toFixed(1)}
          icon={<Activity className="h-3.5 w-3.5" />}
          color={PALETTE.rose}
          delta={deltaOf(model.cur.engagement, model.prev.engagement)}
        />
        <KpiCard
          label="Avg. duration"
          value={fmtDuration(model.cur.avgDurationS)}
          icon={<Timer className="h-3.5 w-3.5" />}
          color={PALETTE.compare}
          delta={deltaOf(model.cur.avgDurationS, model.prev.avgDurationS)}
        />
      </div>

      <ChartCard title="Sessions trend" desc="Unique sessions across the selected window." right={<CompareLegend />}>
        {model.hasData ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={model.trend} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="sess-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PALETTE.primary} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={PALETTE.primary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} allowDecimals={false} tickFormatter={(v: number) => fmtNum(v)} />
                <Tooltip
                  {...TOOLTIP}
                  formatter={(v: number, n: string) => [fmtNum(v), n === "current" ? range.label : range.compareLabel]}
                />
                <Area type="monotone" dataKey="current" stroke={PALETTE.primary} strokeWidth={2} fill="url(#sess-fill)" />
                {range.compareEnabled && (
                  <Line type="monotone" dataKey="previous" stroke={PALETTE.compare} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty icon={<Activity className="h-8 w-8" />} title="No traffic in this range" hint="Widen the date range to see sessions." />
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ChartCard title="Top pages" desc="By sessions in the selected range.">
          {model.topPages.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Page</TH>
                  <TH className="text-right">Sessions</TH>
                  <TH className="text-right">Views</TH>
                  <TH className="w-28">Share</TH>
                </TR>
              </THead>
              <TBody>
                {model.topPages.map((p) => (
                  <TR key={p.page}>
                    <TD className="max-w-[260px] truncate font-mono text-xs text-foreground">{p.page}</TD>
                    <TD className="text-right tabular-nums font-semibold text-foreground">{fmtNum(p.sessions)}</TD>
                    <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(p.views)}</TD>
                    <TD>
                      <MeterBar value={p.sessions} max={model.pageMax} tone="primary" />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <Empty icon={<Globe className="h-8 w-8" />} title="No page data yet" />
          )}
        </ChartCard>

        <ChartCard title="Devices" desc="Sessions by device type.">
          {model.devices.length ? (
            <div className="flex items-center gap-4">
              <div className="h-52 w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={model.devices} dataKey="value" nameKey="name" innerRadius={42} outerRadius={72} paddingAngle={2} stroke="none">
                      {model.devices.map((d, i) => (
                        <Cell key={d.name} fill={DEVICE_COLOR[d.name] ?? SERIES_COLORS[i % SERIES_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...TOOLTIP} formatter={(v: number, n: string) => [`${fmtNum(v)} sessions`, n]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {model.devices.map((d, i) => {
                  const total = model.devices.reduce((s, x) => s + x.value, 0) || 1;
                  return (
                    <div key={d.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 capitalize text-foreground">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: DEVICE_COLOR[d.name] ?? SERIES_COLORS[i % SERIES_COLORS.length] }} />
                        {d.name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {fmtNum(d.value)} · {fmtPct(d.value / total, 0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <Empty icon={<Users className="h-8 w-8" />} title="No device data" />
          )}
        </ChartCard>
      </div>

      <ChartCard title="Event mix" desc="Interaction volume by event type in the selected range.">
        {model.eventMix.length ? (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model.eventMix} margin={{ top: 6, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} allowDecimals={false} tickFormatter={(v: number) => fmtNum(v)} />
                <Tooltip {...TOOLTIP} cursor={{ fill: "hsl(220 8% 12%)" }} formatter={(v: number) => [fmtNum(v), "Events"]} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {model.eventMix.map((_, i) => (
                    <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty icon={<MousePointerClick className="h-8 w-8" />} title="No events to chart" />
        )}
      </ChartCard>
        </>
      )}
    </div>
  );
}
