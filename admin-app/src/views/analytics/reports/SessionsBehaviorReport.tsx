/**
 * Sessions & Behavior report — the "where visits come from and what they do"
 * lens, at Shopify-parity.
 *
 * Scoped to the GLOBAL date range (and, with compare on, the previous same-length
 * window), it answers: sessions over time (with a vs-previous overlay), the
 * device / location / source / social / landing-page / referrer mix, on-site
 * search demand (top queries + the zero-result gaps), and how many sessions
 * actually convert. Every headline carries a vs-previous delta.
 *
 * Data flows through the stable Telemetry + Orders sheets via `useAnalyticsData`
 * (deterministic seed fallback), is rolled into sessions by `rollupSessions`, and
 * the categorical breakdowns reuse the tested `lib/acquisition`, `deviceTech`,
 * `lib/geo` and `lib/searchQueries` derivations — so the numbers match the rest
 * of the analytics suite.
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
import {
  Activity,
  DoorOpen,
  Globe,
  MapPin,
  Monitor,
  Radio,
  Search,
  Share2,
  Target,
  Users,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { buildAcquisition, CHANNEL_COLOR, type Channel } from "@/lib/acquisition";
import { buildGeo } from "@/lib/geo";
import { buildSearchStats } from "@/lib/searchQueries";
import { timeOf } from "@/lib/telemetryFields";
import { cn } from "@/lib/utils";
import { useAnalyticsData } from "../useAnalyticsData";
import { buildDeviceTech, type DeviceType } from "../deviceTech";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { useDateRange } from "./dateRange";
import {
  AXIS,
  ChartCard,
  CompareLegend,
  Delta,
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
import { rollupSessions, bucketize, type SessionRow } from "./sessionsData";

const DEVICE_COLOR: Record<DeviceType, string> = {
  desktop: "hsl(210 72% 56%)",
  mobile: "hsl(4 65% 54%)",
  tablet: "hsl(38 92% 55%)",
  unknown: "hsl(220 6% 42%)",
};

function orderTime(o: { timestamp?: string; received_at?: string }): number {
  return Date.parse(String(o.timestamp ?? o.received_at ?? ""));
}

const uniq = (rows: SessionRow[], key: (r: SessionRow) => string) => new Set(rows.map(key)).size;

export function SessionsBehaviorReport({ config }: { config: AppConfig }) {
  const { events, orders, seeded, loading, liveCount, refresh } = useAnalyticsData(config);
  const range = useDateRange();

  const d = useMemo(() => {
    const curEvents = events.filter((e) => range.inRange(timeOf(e)));
    const curOrders = orders.filter((o) => range.inRange(orderTime(o as never)));

    const rows = rollupSessions(events, orders);
    const cur = rows.filter((r) => range.inRange(r.start));
    const prev = rows.filter((r) => range.inPrev(r.start));

    const acq = buildAcquisition(curEvents, curOrders);
    const dev = buildDeviceTech(curEvents, curOrders);
    const geo = buildGeo(curEvents, curOrders, {
      days: range.days > 0 && Number.isFinite(range.days) ? range.days : 3650,
    });
    const search = buildSearchStats(curEvents);

    const buckets = buildBuckets(range.start, range.end, range.granularity);
    const prevBuckets = range.compareEnabled
      ? buildBuckets(range.prevStart, range.prevEnd, range.granularity)
      : undefined;
    const series = bucketize(cur, buckets, range.compareEnabled ? prev : undefined, prevBuckets);

    const sessions = cur.length;
    const converted = cur.filter((r) => r.converted).length;
    const visitors = uniq(cur, (r) => r.anon);
    const newV = cur.filter((r) => r.isNew).length;

    const pSessions = prev.length;
    const pConverted = prev.filter((r) => r.converted).length;
    const pVisitors = uniq(prev, (r) => r.anon);
    const pNew = prev.filter((r) => r.isNew).length;

    const cr = sessions ? converted / sessions : 0;
    const pCr = pSessions ? pConverted / pSessions : 0;

    const social = acq.sources.filter((s) => s.channel === "Social");
    const referrers = acq.sources.filter((s) => s.channel === "Referral" || s.medium === "referral");

    return {
      series,
      sessions,
      converted,
      visitors,
      newV,
      cr,
      d_sessions: deltaOf(sessions, pSessions),
      d_visitors: deltaOf(visitors, pVisitors),
      d_converted: deltaOf(converted, pConverted),
      d_cr: deltaOf(cr, pCr),
      d_new: deltaOf(newV, pNew),
      channels: acq.channels,
      sources: acq.sources.slice(0, 10),
      social: social.slice(0, 8),
      referrers: referrers.slice(0, 8),
      landing: acq.landing.slice(0, 10),
      devices: dev.devices,
      mobileShare: dev.mobileShare,
      countries: geo.countries.slice(0, 8),
      geoTelemetry: geo.telemetryGeo,
      search,
    };
  }, [events, orders, range]);

  const deviceDonut = d.devices.map((x) => ({
    label: x.label,
    value: x.sessions,
    color: DEVICE_COLOR[x.device],
  }));
  const channelDonut = d.channels.map((c) => ({
    label: c.channel,
    value: c.sessions,
    color: CHANNEL_COLOR[c.channel as Channel],
  }));
  const maxCountry = Math.max(1, ...d.countries.map((c) => c.visitors));

  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        icon={<Activity className="h-5 w-5 text-primary" />}
        title="Sessions & Behavior"
        subtitle="Sessions over time and the device, location, source, social, landing-page and referrer mix — plus on-site search demand and how many visits convert. Scoped to the selected range with vs-previous deltas."
        seeded={seeded}
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          label="Sessions"
          value={fmtNum(d.sessions)}
          icon={<Activity className="h-3.5 w-3.5" />}
          color={PALETTE.primary}
          delta={d.d_sessions}
          spark={d.series.map((p) => p.sessions)}
        />
        <KpiCard
          label="Visitors"
          value={fmtNum(d.visitors)}
          icon={<Users className="h-3.5 w-3.5" />}
          color={PALETTE.violet}
          delta={d.d_visitors}
          sub={`${fmtNum(d.newV)} new`}
        />
        <KpiCard
          label="Converted"
          value={fmtNum(d.converted)}
          icon={<Target className="h-3.5 w-3.5" />}
          color={PALETTE.ok}
          delta={d.d_converted}
          spark={d.series.map((p) => p.converted)}
        />
        <KpiCard
          label="Conversion rate"
          value={fmtPct(d.cr)}
          icon={<Target className="h-3.5 w-3.5" />}
          color={PALETTE.revenue}
          delta={d.d_cr}
        />
        <KpiCard
          label="New visitors"
          value={fmtNum(d.newV)}
          icon={<DoorOpen className="h-3.5 w-3.5" />}
          color={PALETTE.amber}
          delta={d.d_new}
          sub={`${fmtPct(d.visitors ? d.newV / d.visitors : 0)} of visitors`}
        />
      </div>

      {/* Sessions over time */}
      <ChartCard
        title="Sessions over time"
        desc="Sessions started per period, with converting sessions and the previous-period overlay."
        right={<CompareLegend />}
      >
        {d.series.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={d.series} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="sbSessions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETTE.primary} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={PALETTE.primary} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
              <Tooltip {...TOOLTIP} />
              <Area
                type="monotone"
                dataKey="sessions"
                name="Sessions"
                stroke={PALETTE.primary}
                strokeWidth={2}
                fill="url(#sbSessions)"
              />
              <Line
                type="monotone"
                dataKey="converted"
                name="Converted"
                stroke={PALETTE.ok}
                strokeWidth={2}
                dot={false}
              />
              {range.compareEnabled && (
                <Line
                  type="monotone"
                  dataKey="prevSessions"
                  name="Sessions (prev)"
                  stroke={PALETTE.compare}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <Empty icon={<Activity className="h-6 w-6" />} title="No sessions in this range" />
        )}
      </ChartCard>

      {/* Device + source split */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Sessions by device"
          desc={`Mobile is ${fmtPct(d.mobileShare)} of sessions.`}
          right={<Monitor className="h-4 w-4 text-muted-foreground" />}
        >
          <DonutWithTable rows={deviceDonut} unit="sessions" total={d.sessions} />
        </ChartCard>

        <ChartCard
          title="Sessions by source"
          desc="First-touch marketing channel for each session."
          right={<Radio className="h-4 w-4 text-muted-foreground" />}
        >
          <DonutWithTable rows={channelDonut} unit="sessions" total={d.sessions} />
        </ChartCard>
      </div>

      {/* Location */}
      <ChartCard
        title="Sessions by location"
        desc={
          d.geoTelemetry
            ? "Top countries by visitors, resolved from telemetry region metadata."
            : "Top countries by visitors, inferred from order shipping country (no region telemetry yet)."
        }
        right={<Globe className="h-4 w-4 text-muted-foreground" />}
      >
        {d.countries.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <ResponsiveContainer width="100%" height={Math.max(160, d.countries.length * 30)}>
              <BarChart data={d.countries} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={AXIS}
                  tickLine={false}
                  axisLine={false}
                  width={96}
                />
                <Tooltip {...TOOLTIP} />
                <Bar dataKey="visitors" name="Visitors" radius={[0, 4, 4, 0]} fill={PALETTE.primary} />
              </BarChart>
            </ResponsiveContainer>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Country</TH>
                    <TH className="text-right">Visitors</TH>
                    <TH className="text-right">Orders</TH>
                    <TH className="text-right">Share</TH>
                  </TR>
                </THead>
                <TBody>
                  {d.countries.map((c) => (
                    <TR key={c.iso2}>
                      <TD className="whitespace-nowrap">
                        <span className="mr-1.5">{c.flag}</span>
                        {c.name}
                      </TD>
                      <TD className="text-right tabular-nums">{fmtNum(c.visitors)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(c.orders)}</TD>
                      <TD className="text-right">
                        <MiniBar value={c.visitors} max={maxCountry} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        ) : (
          <Empty icon={<MapPin className="h-6 w-6" />} title="No location signal in this range" />
        )}
      </ChartCard>

      {/* Landing pages + Referrers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Top landing pages"
          desc="Where sessions begin, with bounce and conversion."
          right={<DoorOpen className="h-4 w-4 text-muted-foreground" />}
        >
          {d.landing.length ? (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Landing page</TH>
                    <TH className="text-right">Sessions</TH>
                    <TH className="text-right">Bounce</TH>
                    <TH className="text-right">CR</TH>
                  </TR>
                </THead>
                <TBody>
                  {d.landing.map((p) => (
                    <TR key={p.path}>
                      <TD className="max-w-[220px] truncate font-mono text-xs">{p.path}</TD>
                      <TD className="text-right tabular-nums">{fmtNum(p.sessions)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{fmtPct(p.bounceRate)}</TD>
                      <TD className="text-right tabular-nums text-ok">{fmtPct(p.conversion)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          ) : (
            <Empty icon={<DoorOpen className="h-6 w-6" />} title="No landing pages in this range" />
          )}
        </ChartCard>

        <ChartCard
          title="Top referrers"
          desc="External sites and campaigns sending traffic."
          right={<Radio className="h-4 w-4 text-muted-foreground" />}
        >
          {d.referrers.length ? (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Source / medium</TH>
                    <TH className="text-right">Sessions</TH>
                    <TH className="text-right">Orders</TH>
                    <TH className="text-right">CR</TH>
                  </TR>
                </THead>
                <TBody>
                  {d.referrers.map((s) => (
                    <TR key={s.key}>
                      <TD className="max-w-[220px] truncate">
                        <span className="font-medium">{s.source}</span>
                        <span className="text-muted-foreground"> / {s.medium}</span>
                      </TD>
                      <TD className="text-right tabular-nums">{fmtNum(s.sessions)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(s.orders)}</TD>
                      <TD className="text-right tabular-nums text-ok">{fmtPct(s.conversion)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          ) : (
            <Empty icon={<Radio className="h-6 w-6" />} title="No referrers in this range" hint="Most sessions are direct or lack a referrer." />
          )}
        </ChartCard>
      </div>

      {/* Social */}
      <ChartCard
        title="Sessions from social"
        desc="Social networks driving traffic (first-touch)."
        right={<Share2 className="h-4 w-4 text-muted-foreground" />}
      >
        {d.social.length ? (
          <div className="flex flex-wrap gap-2">
            {d.social.map((s) => (
              <div
                key={s.key}
                className="flex min-w-[140px] flex-1 flex-col rounded-lg border border-border bg-card/60 p-3"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold capitalize">
                  <span className="h-2 w-2 rounded-full" style={{ background: CHANNEL_COLOR.Social }} />
                  {s.source}
                </span>
                <span className="mt-1 text-2xl font-semibold tabular-nums">{fmtNum(s.sessions)}</span>
                <span className="text-[11px] text-muted-foreground">
                  {fmtNum(s.orders)} orders · {fmtPct(s.conversion)} CR
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={<Share2 className="h-6 w-6" />} title="No social traffic in this range" />
        )}
      </ChartCard>

      {/* Search */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Top searches"
          desc={`${fmtNum(d.search.total)} searches · ${fmtNum(d.search.distinct)} distinct queries.`}
          right={<Search className="h-4 w-4 text-muted-foreground" />}
        >
          {d.search.top.length ? (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Query</TH>
                    <TH className="text-right">Searches</TH>
                    <TH className="text-right">Sessions</TH>
                    <TH className="text-right">Avg results</TH>
                  </TR>
                </THead>
                <TBody>
                  {d.search.top.slice(0, 10).map((q) => (
                    <TR key={q.query}>
                      <TD className="max-w-[220px] truncate">{q.query}</TD>
                      <TD className="text-right tabular-nums">{fmtNum(q.searches)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(q.sessions)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">
                        {q.avgResults == null ? "—" : Math.round(q.avgResults)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          ) : (
            <Empty icon={<Search className="h-6 w-6" />} title="No searches in this range" />
          )}
        </ChartCard>

        <ChartCard
          title="Zero-result searches"
          desc="Demand the catalog is not answering — recoverable if stocked."
          right={
            d.search.zeroResults > 0 ? (
              <Badge variant="warn">{fmtPct(d.search.zeroRate)} zero-rate</Badge>
            ) : (
              <Search className="h-4 w-4 text-muted-foreground" />
            )
          }
        >
          {d.search.zero.length ? (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Query</TH>
                    <TH className="text-right">Zero-result</TH>
                    <TH className="text-right">Sessions</TH>
                  </TR>
                </THead>
                <TBody>
                  {d.search.zero.slice(0, 10).map((q) => (
                    <TR key={q.query}>
                      <TD className="max-w-[240px] truncate">{q.query}</TD>
                      <TD className="text-right tabular-nums text-down">{fmtNum(q.zeroResults)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(q.sessions)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          ) : (
            <Empty
              icon={<Search className="h-6 w-6" />}
              title="No zero-result searches"
              hint="Either searches carried no result count, or every query found matches."
            />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- sub-pieces -- */

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <span className="ml-auto block h-1.5 w-16 overflow-hidden rounded bg-muted">
      <span className="block h-full rounded bg-primary" style={{ width: `${pct}%` }} />
    </span>
  );
}

function DonutWithTable({
  rows,
  unit,
  total,
}: {
  rows: { label: string; value: number; color: string }[];
  unit: string;
  total: number;
}) {
  const data = rows.filter((r) => r.value > 0);
  if (!data.length) return <Empty icon={<Monitor className="h-6 w-6" />} title="No data in this range" />;
  return (
    <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[160px_1fr]">
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={44} outerRadius={70} paddingAngle={2} strokeWidth={0}>
            {data.map((r) => (
              <Cell key={r.label} fill={r.color} />
            ))}
          </Pie>
          <Tooltip {...TOOLTIP} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5">
        {data.map((r) => {
          const share = total ? r.value / total : 0;
          return (
            <div key={r.label} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
              <span className="flex-1 truncate capitalize">{r.label}</span>
              <span className="tabular-nums text-muted-foreground">{fmtNum(r.value)}</span>
              <span className={cn("w-12 text-right text-xs tabular-nums text-muted-foreground/80")}>
                {fmtPct(share, 0)}
              </span>
            </div>
          );
        })}
        <div className="mt-1 border-t border-border pt-1.5 text-[11px] text-muted-foreground">
          {fmtNum(total)} {unit} total
        </div>
      </div>
    </div>
  );
}

export default SessionsBehaviorReport;
