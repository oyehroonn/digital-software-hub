/**
 * Acquisition / Traffic — where visitors come from and how they arrive.
 *
 * Reads the STABLE Telemetry + Orders sheets (via `useAnalyticsData`), rolls the
 * event stream up into sessions with `lib/acquisition`, and answers: which
 * channels & referrers drive traffic (and orders), new vs returning mix, sessions
 * over time, and the landing / exit pages that start and end journeys. Falls back
 * to the deterministic seed so the page renders before the read endpoint is live.
 *
 * Charts follow the dataviz method: one measure per axis (no dual-axis), a fixed
 * CVD-safe categorical colour per channel (validated on the dark surface), and a
 * legend + direct labels so identity is never colour-alone.
 */
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Globe, Radio, Users, DoorOpen, LogOut, ArrowDownUp } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import {
  buildAcquisition,
  fillDailyGaps,
  CHANNELS,
  CHANNEL_COLOR,
  type Channel,
} from "@/lib/acquisition";
import { timeOf } from "@/lib/telemetryFields";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader, AnalyticsEmpty, StatTile, MeterBar } from "./shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/Empty";
import { cn, fmtMoney } from "@/lib/utils";

const AXIS = { fill: "#9aa0a6", fontSize: 11 } as const;
const GRID = "hsl(220 6% 16%)";
const TOOLTIP_STYLE = {
  background: "hsl(220 8% 7%)",
  border: "1px solid hsl(220 6% 16%)",
  borderRadius: 8,
  fontSize: 12,
} as const;

const NEW_COLOR = "#199e70"; // green — first-time visitors
const RET_COLOR = "#3987e5"; // blue — returning visitors

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));

type RangeKey = "7" | "14" | "30" | "all";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7", label: "7d" },
  { key: "14", label: "14d" },
  { key: "30", label: "30d" },
  { key: "all", label: "All" },
];

/** Small colour-dot + label chip used as a shared legend. */
function LegendChip({ color, label, value }: { color: string; label: string; value?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
      <span className="text-foreground/80">{label}</span>
      {value != null && <span className="tabular-nums">{value}</span>}
    </span>
  );
}

export function Acquisition({ config }: { config: AppConfig }) {
  const { events, orders, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config);
  const [range, setRange] = useState<RangeKey>("14");

  // Range filter: keep events inside the last N days (by max timestamp in-set,
  // so it works for both the live sheet and the now-relative seed).
  const scoped = useMemo(() => {
    if (range === "all") return events;
    const days = Number(range);
    let max = 0;
    for (const e of events) {
      const t = timeOf(e);
      if (Number.isFinite(t) && t > max) max = t;
    }
    if (!max) return events;
    const cutoff = max - days * 86_400_000;
    return events.filter((e) => {
      const t = timeOf(e);
      return !Number.isFinite(t) || t >= cutoff;
    });
  }, [events, range]);

  const a = useMemo(() => buildAcquisition(scoped, orders), [scoped, orders]);
  const daily = useMemo(() => fillDailyGaps(a.daily), [a.daily]);

  const maxSessions = a.channels[0]?.sessions ?? 1;
  const maxSource = a.sources[0]?.sessions ?? 1;
  const maxLanding = a.landing[0]?.sessions ?? 1;
  const maxExit = a.exits[0]?.sessions ?? 1;

  const newRetData = [
    { name: "New", value: a.newVisitors, color: NEW_COLOR },
    { name: "Returning", value: a.returningVisitors, color: RET_COLOR },
  ].filter((d) => d.value > 0);

  // Channels present, in the fixed CHANNELS order (stable colour → entity).
  const activeChannels = CHANNELS.filter((c) => a.channels.some((x) => x.channel === c && x.sessions > 0));

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<Globe className="h-4 w-4 text-primary" />}
        title="Acquisition & Traffic"
        subtitle="Where sessions come from and how visitors arrive — channels, referrers, new vs returning, traffic over time, and the landing & exit pages that start and end each journey."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
        right={
          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
            {RANGES.map((r) => (
              <Button
                key={r.key}
                size="sm"
                variant={range === r.key ? "default" : "ghost"}
                className="h-7 px-2 text-xs"
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        }
      />

      {isEmpty ? (
        <AnalyticsEmpty icon={<Globe className="h-7 w-7" />} />
      ) : (
        <>
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Sessions" value={a.sessions.toLocaleString("en-US")} sub={`${a.visitors.toLocaleString("en-US")} unique visitors`} />
        <StatTile
          label="New visitors"
          value={pct(a.sessions ? a.newVisitors / a.sessions : 0)}
          sub={`${a.newVisitors.toLocaleString("en-US")} new · ${a.returningVisitors.toLocaleString("en-US")} returning`}
          tone="ok"
        />
        <StatTile label="Conversion" value={pct(a.conversion)} sub={`${a.orders.toLocaleString("en-US")} orders`} tone="primary" />
        <StatTile label="Revenue" value={fmtMoney(a.revenue)} sub={`${a.avgPagesPerSession.toFixed(1)} pages/session · ${pct(a.bounceRate)} bounce`} />
      </div>

      {a.sessions === 0 ? (
        <Empty
          icon={<Globe className="h-8 w-8" />}
          title="No traffic telemetry yet"
          hint="Acquisition lights up once sessions carry a page_view with a referrer or utm_source in event metadata."
        />
      ) : (
        <>
          {/* Sessions over time by channel */}
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex items-center gap-2">
                <ArrowDownUp className="h-4 w-4 text-primary" /> Sessions over time
              </CardTitle>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {activeChannels.map((c) => (
                  <LegendChip key={c} color={CHANNEL_COLOR[c]} label={c} />
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daily} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      {activeChannels.map((c) => (
                        <linearGradient key={c} id={`grad-${c}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CHANNEL_COLOR[c]} stopOpacity={0.55} />
                          <stop offset="100%" stopColor={CHANNEL_COLOR[c]} stopOpacity={0.05} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={compact} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#e8e8e8" }} cursor={{ stroke: GRID }} />
                    {activeChannels.map((c) => (
                      <Area
                        key={c}
                        type="monotone"
                        dataKey={c}
                        stackId="ch"
                        stroke={CHANNEL_COLOR[c]}
                        strokeWidth={1.5}
                        fill={`url(#grad-${c})`}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Channel mix donut + new/returning */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary" /> Channel mix
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={a.channels.map((c) => ({ name: c.channel, value: c.sessions, color: CHANNEL_COLOR[c.channel] }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={44}
                        outerRadius={70}
                        paddingAngle={2}
                        stroke="hsl(220 8% 7%)"
                        strokeWidth={2}
                      >
                        {a.channels.map((c) => (
                          <Cell key={c.channel} fill={CHANNEL_COLOR[c.channel]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#e8e8e8" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  {a.channels.map((c) => (
                    <div key={c.channel} className="flex items-center justify-between gap-2 text-xs">
                      <LegendChip color={CHANNEL_COLOR[c.channel]} label={c.channel} />
                      <span className="tabular-nums text-muted-foreground">
                        {c.sessions.toLocaleString("en-US")} · {pct(c.share)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> New vs returning
                </CardTitle>
                <div className="flex items-center gap-3">
                  <LegendChip color={NEW_COLOR} label="New" />
                  <LegendChip color={RET_COLOR} label="Returning" />
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-[150px_1fr]">
                <div className="flex flex-col items-center justify-center">
                  <div className="h-36 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={newRetData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={60} paddingAngle={2} stroke="hsl(220 8% 7%)" strokeWidth={2}>
                          {newRetData.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#e8e8e8" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-1 grid w-full grid-cols-2 gap-2 text-center">
                    <div>
                      <div className="text-lg font-semibold tabular-nums" style={{ color: NEW_COLOR }}>{pct(a.newReturningConv.newConv)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">new conv.</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold tabular-nums" style={{ color: RET_COLOR }}>{pct(a.newReturningConv.returningConv)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">return conv.</div>
                    </div>
                  </div>
                </div>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={daily} margin={{ top: 6, right: 8, left: -18, bottom: 0 }} barCategoryGap="18%">
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={compact} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#e8e8e8" }} cursor={{ fill: GRID, opacity: 0.35 }} />
                      <Bar dataKey="newVisitors" name="New" stackId="v" fill={NEW_COLOR} radius={[0, 0, 0, 0]} maxBarSize={26} />
                      <Bar dataKey="returning" name="Returning" stackId="v" fill={RET_COLOR} radius={[3, 3, 0, 0]} maxBarSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Channels table + conversion bars */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Channels</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>Channel</TH>
                      <TH className="text-right">Sessions</TH>
                      <TH className="text-right">New</TH>
                      <TH className="text-right">Orders</TH>
                      <TH className="text-right">Conv.</TH>
                      <TH className="text-right">Revenue</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {a.channels.map((c) => (
                      <TR key={c.channel}>
                        <TD>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: CHANNEL_COLOR[c.channel] }} />
                            <span className="font-medium">{c.channel}</span>
                          </div>
                          <MeterBar className="mt-1" value={c.sessions} max={maxSessions} />
                        </TD>
                        <TD className="text-right tabular-nums">{c.sessions.toLocaleString("en-US")}</TD>
                        <TD className="text-right tabular-nums text-muted-foreground">{c.newVisitors.toLocaleString("en-US")}</TD>
                        <TD className="text-right tabular-nums">{c.orders}</TD>
                        <TD className="text-right">
                          <Badge variant={c.conversion >= 0.05 ? "ok" : c.conversion > 0 ? "warn" : "muted"}>{pct(c.conversion)}</Badge>
                        </TD>
                        <TD className="text-right tabular-nums text-muted-foreground">{c.revenue ? fmtMoney(c.revenue) : "—"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversion rate by channel</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={a.channels.map((c) => ({ name: c.channel, conv: +(c.conversion * 100).toFixed(2), color: CHANNEL_COLOR[c.channel] }))}
                      margin={{ top: 4, right: 40, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                      <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={64} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={{ color: "#e8e8e8" }}
                        cursor={{ fill: GRID, opacity: 0.35 }}
                        formatter={(v: number) => [`${v}%`, "Conversion"]}
                      />
                      <Bar dataKey="conv" radius={[0, 4, 4, 0]} maxBarSize={22}>
                        {a.channels.map((c) => (
                          <Cell key={c.channel} fill={CHANNEL_COLOR[c.channel]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top sources / referrers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" /> Top sources & referrers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Source / medium</TH>
                    <TH>Channel</TH>
                    <TH className="text-right">Sessions</TH>
                    <TH className="text-right">Orders</TH>
                    <TH className="text-right">Conv.</TH>
                    <TH className="text-right">Revenue</TH>
                  </TR>
                </THead>
                <TBody>
                  {a.sources.slice(0, 16).map((s) => (
                    <TR key={s.key}>
                      <TD>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s.source}</span>
                          <Badge variant="muted">{s.medium}</Badge>
                        </div>
                        <MeterBar className="mt-1" value={s.sessions} max={maxSource} />
                      </TD>
                      <TD>
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-2 w-2 rounded-[2px]" style={{ background: CHANNEL_COLOR[s.channel] }} />
                          {s.channel}
                        </span>
                      </TD>
                      <TD className="text-right tabular-nums">{s.sessions.toLocaleString("en-US")}</TD>
                      <TD className="text-right tabular-nums">{s.orders}</TD>
                      <TD className="text-right">
                        <Badge variant={s.conversion >= 0.05 ? "ok" : s.conversion > 0 ? "warn" : "muted"}>{pct(s.conversion)}</Badge>
                      </TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{s.revenue ? fmtMoney(s.revenue) : "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          {/* Landing + exit pages */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DoorOpen className="h-4 w-4 text-ok" /> Landing (entry) pages
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>Page</TH>
                      <TH className="text-right">Entrances</TH>
                      <TH className="text-right">Bounce</TH>
                      <TH className="text-right">Conv.</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {a.landing.slice(0, 12).map((p) => (
                      <TR key={p.path}>
                        <TD className="max-w-[190px] truncate font-medium" title={p.path}>{p.path}</TD>
                        <TD className="text-right">
                          <div className="tabular-nums">{p.sessions.toLocaleString("en-US")}</div>
                          <MeterBar className="mt-1" value={p.sessions} max={maxLanding} tone="ok" />
                        </TD>
                        <TD className="text-right">
                          <Badge variant={p.bounceRate >= 0.6 ? "down" : p.bounceRate >= 0.4 ? "warn" : "muted"}>{pct(p.bounceRate)}</Badge>
                        </TD>
                        <TD className="text-right">
                          <Badge variant={p.conversion >= 0.05 ? "ok" : p.conversion > 0 ? "warn" : "muted"}>{pct(p.conversion)}</Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LogOut className="h-4 w-4 text-warn" /> Exit pages
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>Page</TH>
                      <TH className="text-right">Exits</TH>
                      <TH className="text-right">Exit share</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {a.exits.slice(0, 12).map((p) => (
                      <TR key={p.path}>
                        <TD className="max-w-[220px] truncate font-medium" title={p.path}>{p.path}</TD>
                        <TD className="text-right">
                          <div className="tabular-nums">{p.sessions.toLocaleString("en-US")}</div>
                          <MeterBar className="mt-1" value={p.sessions} max={maxExit} tone="warn" />
                        </TD>
                        <TD className={cn("text-right tabular-nums text-muted-foreground")}>
                          {pct(a.sessions ? p.sessions / a.sessions : 0)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
        </>
      )}
    </div>
  );
}
