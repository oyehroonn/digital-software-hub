/**
 * Devices & Tech — how visitors reach the store: device type, browser, OS and
 * screen-size mix, plus a mobile-vs-desktop conversion comparison and a
 * performance / engagement note. Every breakdown is at the session grain and is
 * derived by `buildDeviceTech` from user_agent + metadata on the Telemetry
 * sheet, with the deterministic seed rendering the page before live data lands.
 *
 * Recharts donuts + bars, tables, styled to the admin theme.
 */
import { useMemo } from "react";
import {
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
import { MonitorSmartphone, Chrome, Cpu, Gauge, Smartphone, Monitor, Tablet, HelpCircle } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader, AnalyticsEmpty, StatTile, MeterBar } from "./shell";
import { buildDeviceTech, type DeviceType, type TechRow } from "./deviceTech";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const pct0 = (v: number) => `${Math.round(v * 100)}%`;

/** Categorical palette that reads cleanly on the dark admin surface. */
const PALETTE = [
  "hsl(4 65% 54%)", // primary red
  "hsl(210 72% 56%)", // blue
  "hsl(38 92% 55%)", // amber
  "hsl(150 52% 46%)", // green
  "hsl(265 60% 64%)", // violet
  "hsl(190 66% 50%)", // cyan
  "hsl(320 55% 60%)", // pink
  "hsl(48 82% 56%)", // yellow
];

const DEVICE_COLOR: Record<DeviceType, string> = {
  desktop: "hsl(210 72% 56%)",
  mobile: "hsl(4 65% 54%)",
  tablet: "hsl(38 92% 55%)",
  unknown: "hsl(220 6% 42%)",
};

const DEVICE_ICON: Record<DeviceType, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: HelpCircle,
};

const TOOLTIP_STYLE = {
  background: "hsl(220 8% 7%)",
  border: "1px solid hsl(220 6% 16%)",
  borderRadius: 8,
  fontSize: 12,
} as const;
const AXIS = { fill: "#9aa0a6", fontSize: 11 } as const;
const GRID = "hsl(220 6% 16%)";

/** A donut with a big centred headline (count + label). */
function Donut({
  data,
  center,
  centerSub,
}: {
  data: { label: string; value: number; color: string }[];
  center: string;
  centerSub: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="relative h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={82}
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="hsl(220 8% 7%)"
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
          >
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "#e8e8e8" }}
            formatter={(value: number, name: string) => [
              `${value.toLocaleString("en-US")} · ${pct(total ? value / total : 0)}`,
              name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-semibold tabular-nums text-foreground">{center}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{centerSub}</div>
      </div>
    </div>
  );
}

/** Colour-coded legend rows under a donut (label · share · count). */
function Legend({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex flex-col gap-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
          <span className="min-w-0 flex-1 truncate text-foreground/90">{d.label}</span>
          <span className="tabular-nums text-muted-foreground">{pct0(total ? d.value / total : 0)}</span>
          <span className="w-10 text-right tabular-nums font-medium">{d.value.toLocaleString("en-US")}</span>
        </div>
      ))}
    </div>
  );
}

function ScreenTooltip({ active, payload }: { active?: boolean; payload?: { payload: TechRow }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE} className="px-2.5 py-1.5">
      <div className="mb-0.5 font-medium text-foreground">{r.label}</div>
      <div className="text-muted-foreground">
        {r.sessions.toLocaleString("en-US")} sessions · {pct(r.share)} · conv {pct(r.conversion)}
      </div>
    </div>
  );
}

export function DevicesTech({ config }: { config: AppConfig }) {
  const { events, orders, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config);
  const t = useMemo(() => buildDeviceTech(events, orders), [events, orders]);

  const deviceDonut = t.devices.map((d) => ({ label: d.label, value: d.sessions, color: DEVICE_COLOR[d.device] }));
  const osDonut = t.os.slice(0, 7).map((o, i) => ({ label: o.label, value: o.sessions, color: PALETTE[i % PALETTE.length] }));

  const desktop = t.devices.find((d) => d.device === "desktop");
  const mobile = t.devices.find((d) => d.device === "mobile");
  const tablet = t.devices.find((d) => d.device === "tablet");
  const mobileLike = [mobile, tablet].filter(Boolean) as NonNullable<typeof mobile>[];
  const mobileConv = mobileLike.reduce((a, d) => a + d.orders, 0) / Math.max(1, mobileLike.reduce((a, d) => a + d.sessions, 0));
  const convGap = desktop && desktop.conversion > 0 ? (mobileConv - desktop.conversion) / desktop.conversion : 0;

  const maxBrowser = t.browsers[0]?.sessions ?? 1;

  const empty = t.totalSessions === 0;

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<MonitorSmartphone className="h-4 w-4 text-primary" />}
        title="Devices & tech"
        subtitle="Device type, browser, OS and screen-size mix parsed from the user-agent and viewport metadata — plus how mobile and desktop compare on conversion, and where performance is holding sales back."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {isEmpty ? (
        <AnalyticsEmpty icon={<MonitorSmartphone className="h-7 w-7" />} />
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Sessions" value={t.totalSessions.toLocaleString("en-US")} sub={`${t.identifiedUA.toLocaleString("en-US")} device-identified`} />
        <StatTile label="Mobile + tablet share" value={pct0(t.mobileShare)} tone="primary" sub={`${pct0(1 - t.mobileShare)} desktop`} />
        <StatTile label="Orders" value={t.totalOrders.toLocaleString("en-US")} tone="ok" sub={`${t.sheetOrders.toLocaleString("en-US")} on Orders sheet`} />
        <StatTile label="Overall conversion" value={pct(t.overallConversion)} sub="orders ÷ sessions" />
      </div>

      {empty ? (
        <Empty
          icon={<MonitorSmartphone className="h-8 w-8" />}
          title="No device telemetry yet"
          hint="Breakdowns appear once events carry a user_agent and a viewport width in metadata."
        />
      ) : (
        <>
          {/* Device + OS donuts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0">
                <MonitorSmartphone className="h-4 w-4 text-primary" />
                <CardTitle>Device type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2">
                  <Donut
                    data={deviceDonut}
                    center={pct0(t.mobileShare)}
                    centerSub="mobile + tablet"
                  />
                  <Legend data={deviceDonut} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0">
                <Cpu className="h-4 w-4 text-primary" />
                <CardTitle>Operating system</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2">
                  <Donut
                    data={osDonut}
                    center={t.os.length.toString()}
                    centerSub="platforms"
                  />
                  <Legend data={osDonut} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Browser bars + table */}
          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Chrome className="h-4 w-4 text-primary" />
              <CardTitle>Browsers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={t.browsers.slice(0, 8)} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                      <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                      <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={92} />
                      <Tooltip
                        cursor={{ fill: "hsl(220 6% 14% / 0.5)" }}
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={{ color: "#e8e8e8" }}
                        formatter={(value: number) => [`${value.toLocaleString("en-US")} sessions`, "Sessions"]}
                      />
                      <Bar dataKey="sessions" radius={[0, 3, 3, 0]} maxBarSize={26}>
                        {t.browsers.slice(0, 8).map((b, i) => (
                          <Cell key={b.key} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <Table>
                  <THead>
                    <TR>
                      <TH>Browser</TH>
                      <TH className="text-right">Sessions</TH>
                      <TH className="text-right">Share</TH>
                      <TH className="text-right">Orders</TH>
                      <TH className="text-right">Conv.</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {t.browsers.slice(0, 8).map((b, i) => (
                      <TR key={b.key}>
                        <TD>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
                            <span className="font-medium">{b.label}</span>
                          </div>
                          <MeterBar className="mt-1" value={b.sessions} max={maxBrowser} />
                        </TD>
                        <TD className="text-right tabular-nums">{b.sessions.toLocaleString("en-US")}</TD>
                        <TD className="text-right tabular-nums text-muted-foreground">{pct(b.share)}</TD>
                        <TD className="text-right tabular-nums">{b.orders}</TD>
                        <TD className="text-right">
                          <Badge variant={b.conversion >= 0.05 ? "ok" : b.conversion > 0 ? "warn" : "muted"}>{pct(b.conversion)}</Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Screen-size distribution */}
          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Monitor className="h-4 w-4 text-primary" />
              <CardTitle>Screen-size distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">
                Sessions bucketed by viewport width (normalised from metadata; sessions without a reported width are
                treated as 1440px desktop). Use it to prioritise which breakpoints the storefront must nail.
              </p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={t.screens} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ ...AXIS, fontSize: 10 }} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "hsl(220 6% 14% / 0.5)" }} content={<ScreenTooltip />} />
                    <Bar dataKey="sessions" radius={[3, 3, 0, 0]} maxBarSize={64}>
                      {t.screens.map((s, i) => (
                        <Cell key={s.key} fill={i <= 1 ? DEVICE_COLOR.mobile : i === 2 ? DEVICE_COLOR.tablet : DEVICE_COLOR.desktop} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Mobile vs desktop conversion comparison */}
          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Smartphone className="h-4 w-4 text-primary" />
              <CardTitle>Mobile vs desktop conversion</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={t.devices.filter((d) => d.device !== "unknown")} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                      <Tooltip
                        cursor={{ fill: "hsl(220 6% 14% / 0.5)" }}
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={{ color: "#e8e8e8" }}
                        formatter={(value: number) => [pct(value), "Conversion"]}
                      />
                      <Bar dataKey="conversion" radius={[3, 3, 0, 0]} maxBarSize={72}>
                        {t.devices.filter((d) => d.device !== "unknown").map((d) => (
                          <Cell key={d.key} fill={DEVICE_COLOR[d.device]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex flex-col justify-center gap-3">
                  <div
                    className={
                      "rounded-lg border p-3 " +
                      (convGap < -0.15 ? "border-down/40 bg-down/5" : convGap > 0.15 ? "border-ok/40 bg-ok/5" : "border-border bg-card")
                    }
                  >
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Mobile vs desktop conversion</div>
                    <div className={"mt-0.5 text-2xl font-semibold tabular-nums " + (convGap < 0 ? "text-down" : "text-ok")}>
                      {convGap >= 0 ? "+" : ""}
                      {Math.round(convGap * 100)}%
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Mobile+tablet convert at {pct(mobileConv)} vs {pct(desktop?.conversion ?? 0)} on desktop.
                    </div>
                  </div>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Device</TH>
                        <TH className="text-right">Sessions</TH>
                        <TH className="text-right">Orders</TH>
                        <TH className="text-right">Conv.</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {t.devices.filter((d) => d.device !== "unknown").map((d) => {
                        const Icon = DEVICE_ICON[d.device];
                        return (
                          <TR key={d.key}>
                            <TD>
                              <div className="flex items-center gap-2">
                                <Icon className="h-3.5 w-3.5" style={{ color: DEVICE_COLOR[d.device] }} />
                                <span className="font-medium">{d.label}</span>
                              </div>
                            </TD>
                            <TD className="text-right tabular-nums">{d.sessions.toLocaleString("en-US")}</TD>
                            <TD className="text-right tabular-nums">{d.orders.toLocaleString("en-US")}</TD>
                            <TD className="text-right">
                              <Badge variant={d.conversion >= 0.05 ? "ok" : d.conversion > 0 ? "warn" : "muted"}>{pct(d.conversion)}</Badge>
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance / engagement note */}
          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Gauge className="h-4 w-4 text-primary" />
              <CardTitle>Performance & engagement note</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={
                  "mb-3 rounded-lg border p-3 text-sm " +
                  (convGap < -0.15 ? "border-warn/40 bg-warn/5 text-foreground" : "border-border bg-card text-muted-foreground")
                }
              >
                {convGap < -0.15 ? (
                  <>
                    <span className="font-semibold text-foreground">Mobile is under-converting.</span>{" "}
                    {pct0(t.mobileShare)} of sessions are on mobile or tablet, yet they convert{" "}
                    <span className="font-semibold text-warn">{Math.abs(Math.round(convGap * 100))}% lower</span> than desktop. Prioritise
                    mobile page-weight, tap-target sizing and a shorter checkout — a small lift here compounds across the largest
                    slice of traffic.
                  </>
                ) : (
                  <>
                    Mobile and tablet make up{" "}
                    <span className="font-semibold text-foreground">{pct0(t.mobileShare)}</span> of sessions and convert in line with
                    desktop. {t.hasTiming ? "Load timing was reported in telemetry — see per-device figures below." : "No page-load timing is reported in telemetry yet; the figures below use on-page engagement (interactions & scroll depth) as a proxy — add a load-time field to metadata to track real speed by device."}
                  </>
                )}
              </div>
              <Table>
                <THead>
                  <TR>
                    <TH>Device</TH>
                    <TH className="text-right">Sessions</TH>
                    <TH className="text-right">{t.hasTiming ? "Avg load" : "Avg load"}</TH>
                    <TH className="text-right">Interactions / session</TH>
                    <TH className="text-right">Avg scroll depth</TH>
                    <TH className="text-right">Conv.</TH>
                  </TR>
                </THead>
                <TBody>
                  {t.perf.map((p) => {
                    const Icon = DEVICE_ICON[p.device];
                    return (
                      <TR key={p.device}>
                        <TD>
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" style={{ color: DEVICE_COLOR[p.device] }} />
                            <span className="font-medium">{p.label}</span>
                          </div>
                        </TD>
                        <TD className="text-right tabular-nums">{p.sessions.toLocaleString("en-US")}</TD>
                        <TD className="text-right tabular-nums text-muted-foreground">
                          {p.avgLoadMs != null ? `${(p.avgLoadMs / 1000).toFixed(2)}s` : "—"}
                        </TD>
                        <TD className="text-right tabular-nums">{p.avgEvents.toFixed(1)}</TD>
                        <TD className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="tabular-nums text-muted-foreground">{Math.round(p.avgScroll)}%</span>
                            <MeterBar className="w-16" value={p.avgScroll} max={100} tone="ok" />
                          </div>
                        </TD>
                        <TD className="text-right">
                          <Badge variant={p.conversion >= 0.05 ? "ok" : p.conversion > 0 ? "warn" : "muted"}>{pct(p.conversion)}</Badge>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
        </>
      )}
    </div>
  );
}
