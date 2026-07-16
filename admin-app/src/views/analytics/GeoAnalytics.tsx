/**
 * GEO / LOCATION analytics — where visitors, events, orders and revenue come
 * from, by country, city and continent.
 *
 * Self-fetches the STABLE Telemetry + Orders sheets via `useAnalyticsData`
 * (deterministic-seed fallback so it renders before the read endpoint is live)
 * and rolls them up with `buildGeo`. Regions come from telemetry
 * `metadata.country/city` when present, otherwise from the Orders sheet.
 *
 * Layout (recharts + a hand-built SVG bubble map — no external map lib / CDN):
 *   • KPI row  • SVG equirectangular bubble world map (metric-toggled)
 *   • Top-countries bar  • visitors-by-continent donut  • revenue-by-region bar
 *   • day-by-day time trend (filterable to the selected country)
 *   • top-countries table (flag + meters)  • top-cities table
 */
import { useMemo, useState } from "react";
import {
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
import { Globe2, MapPin, Building2, Users, ShoppingBag, DollarSign } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { buildGeo, flagEmoji, project, type CountryStat, type GeoAgg } from "@/lib/geo";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader, AnalyticsEmpty, StatTile, MeterBar } from "./shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { fmtMoney } from "@/lib/utils";

/* ---- shared chart styling (matches the admin theme used elsewhere) ---- */
const AXIS = { fill: "#9aa0a6", fontSize: 11 };
const GRID = "hsl(220 6% 16%)";
const TOOLTIP = {
  contentStyle: { background: "hsl(220 8% 7%)", border: "1px solid hsl(220 6% 16%)", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#e8e8e8" },
  itemStyle: { color: "#e8e8e8" },
} as const;

/** Continent palette — one accent per region, consistent across every chart. */
const CONTINENT_COLORS: Record<string, string> = {
  "N. America": "hsl(4 72% 56%)",
  "S. America": "hsl(24 88% 55%)",
  Europe: "hsl(210 80% 58%)",
  Africa: "hsl(142 58% 46%)",
  Asia: "hsl(38 92% 55%)",
  Oceania: "hsl(265 62% 64%)",
  Other: "hsl(220 6% 45%)",
};
const contColor = (c: string) => CONTINENT_COLORS[c] ?? CONTINENT_COLORS.Other;

type Metric = "visitors" | "events" | "orders" | "revenue";
const METRICS: { key: Metric; label: string; icon: typeof Users }[] = [
  { key: "visitors", label: "Visitors", icon: Users },
  { key: "events", label: "Events", icon: MapPin },
  { key: "orders", label: "Orders", icon: ShoppingBag },
  { key: "revenue", label: "Revenue", icon: DollarSign },
];
const metricVal = (c: CountryStat, m: Metric): number =>
  m === "visitors" ? c.visitors : m === "events" ? c.events : m === "orders" ? c.orders : c.revenue;

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}
function fmtCompact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n));
}

/* ============================ SVG bubble world map ============================ */
const MAP_W = 1000;
const MAP_H = 500;

function WorldBubbleMap({
  geo,
  metric,
  selected,
  onSelect,
}: {
  geo: GeoAgg;
  metric: Metric;
  selected: string | null;
  onSelect: (iso2: string | null) => void;
}) {
  const rows = geo.countries.filter((c) => metricVal(c, metric) > 0);
  const max = Math.max(1, ...rows.map((c) => metricVal(c, metric)));
  // Area-proportional radius (sqrt) so big markets don't swallow the map.
  const radius = (v: number) => 6 + Math.sqrt(v / max) * 34;
  const graticule = [-120, -60, 0, 60, 120];
  const parallels = [-60, -30, 0, 30, 60];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="h-auto w-full min-w-[560px]"
        role="img"
        aria-label="World map of activity by country"
        onClick={() => onSelect(null)}
      >
        <defs>
          <radialGradient id="geo-ocean" cx="50%" cy="42%" r="75%">
            <stop offset="0%" stopColor="hsl(220 12% 12%)" />
            <stop offset="100%" stopColor="hsl(220 10% 8%)" />
          </radialGradient>
          <filter id="geo-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x={0} y={0} width={MAP_W} height={MAP_H} rx={14} fill="url(#geo-ocean)" stroke={GRID} />

        {/* graticule */}
        {graticule.map((lng) => {
          const { x } = project(0, lng, MAP_W, MAP_H);
          return <line key={`m${lng}`} x1={x} y1={8} x2={x} y2={MAP_H - 8} stroke={GRID} strokeWidth={1} strokeDasharray="2 6" />;
        })}
        {parallels.map((lat) => {
          const { y } = project(lat, 0, MAP_W, MAP_H);
          return <line key={`p${lat}`} x1={8} y1={y} x2={MAP_W - 8} y2={y} stroke={GRID} strokeWidth={1} strokeDasharray="2 6" />;
        })}

        {/* bubbles — largest first so small ones stay clickable on top */}
        {rows
          .slice()
          .sort((a, b) => metricVal(b, metric) - metricVal(a, metric))
          .map((c) => {
            const { x, y } = project(c.lat, c.lng, MAP_W, MAP_H);
            const r = radius(metricVal(c, metric));
            const isSel = selected === c.iso2;
            const dim = selected != null && !isSel;
            const fill = contColor(c.continent);
            return (
              <g
                key={c.iso2}
                transform={`translate(${x} ${y})`}
                className="cursor-pointer"
                opacity={dim ? 0.28 : 1}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(isSel ? null : c.iso2);
                }}
              >
                <title>
                  {c.name} · {fmtNum(c.visitors)} visitors · {fmtNum(c.orders)} orders · {fmtMoney(c.revenue, geo.currency)}
                </title>
                <circle r={r} fill={fill} fillOpacity={0.22} stroke={fill} strokeWidth={isSel ? 2.5 : 1.4} filter={isSel ? "url(#geo-glow)" : undefined} />
                <circle r={Math.min(3.5, r / 3)} fill={fill} />
                {(r > 16 || isSel) && (
                  <text textAnchor="middle" y={-r - 5} fontSize={13} className="pointer-events-none select-none">
                    {c.flag}
                  </text>
                )}
              </g>
            );
          })}
      </svg>
    </div>
  );
}

/* ================================ main view ================================ */
export function GeoAnalytics({ config }: { config: AppConfig }) {
  const { events, orders, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config);
  const [metric, setMetric] = useState<Metric>("visitors");
  const [selected, setSelected] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const geo = useMemo(() => buildGeo(events, orders, { days, country: selected }), [events, orders, days, selected]);

  const selCountry = useMemo(
    () => (selected ? geo.countries.find((c) => c.iso2 === selected) ?? null : null),
    [geo, selected],
  );

  const topCountries = useMemo(
    () =>
      geo.countries
        .slice()
        .sort((a, b) => metricVal(b, metric) - metricVal(a, metric))
        .slice(0, 10)
        .map((c) => ({ ...c, _v: metricVal(c, metric) })),
    [geo, metric],
  );

  const continentDonut = useMemo(
    () => geo.continents.filter((c) => c.visitors > 0).map((c) => ({ name: c.continent, value: c.visitors, revenue: c.revenue })),
    [geo],
  );
  const revenueByRegion = useMemo(
    () => geo.continents.filter((c) => c.revenue > 0).map((c) => ({ name: c.continent, revenue: c.revenue })).sort((a, b) => b.revenue - a.revenue),
    [geo],
  );

  const cities = useMemo(
    () => (selected ? geo.cities.filter((c) => c.iso2 === selected) : geo.cities).slice(0, 12),
    [geo, selected],
  );

  const metricMax = Math.max(1, ...topCountries.map((c) => c._v));
  const cityRevMax = Math.max(1, ...cities.map((c) => c.revenue));
  const empty = geo.totals.countries === 0;

  const metricLabel = METRICS.find((m) => m.key === metric)!.label;
  const barValue = (v: number) => (metric === "revenue" ? fmtMoney(v, geo.currency) : fmtNum(v));

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<Globe2 className="h-4 w-4 text-primary" />}
        title="Geo & location analytics"
        subtitle="Where your audience is — visitors, events, orders and revenue by country, city and region. Regions come from telemetry geo when present, otherwise from the Orders sheet."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
        right={
          <div className="flex items-center gap-2">
            <Badge variant={geo.visitorSource === "telemetry" ? "ok" : "muted"} title="Source of visitor counts">
              visitors · {geo.visitorSource}
            </Badge>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="h-8 rounded-md border border-border bg-secondary px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title="Time-trend window"
            >
              {[7, 14, 30, 90].map((d) => (
                <option key={d} value={d}>
                  Last {d}d
                </option>
              ))}
            </select>
          </div>
        }
      />

      {isEmpty ? (
        <AnalyticsEmpty icon={<Globe2 className="h-7 w-7" />} />
      ) : (
        <>
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Countries" value={fmtNum(geo.totals.countries)} tone="primary" />
        <StatTile label="Cities" value={fmtNum(geo.totals.cities)} />
        <StatTile label="Visitors" value={fmtNum(geo.totals.visitors)} />
        <StatTile label="Events" value={fmtNum(geo.totals.events)} sub={geo.telemetryGeo ? "geo-tagged telemetry" : "no telemetry geo"} />
        <StatTile label="Orders" value={fmtNum(geo.totals.orders)} tone="ok" />
        <StatTile label="Revenue" value={fmtMoney(geo.totals.revenue, geo.currency)} tone="primary" />
      </div>

      {empty ? (
        <Empty
          icon={<Globe2 className="h-8 w-8" />}
          title="No location data yet"
          hint="Countries appear once telemetry events carry a metadata.country/city or the Orders sheet has city/country filled in."
        />
      ) : (
        <>
          {/* Map + metric toggle */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                World activity
                {selCountry && (
                  <button
                    onClick={() => setSelected(null)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                    title="Clear country filter"
                  >
                    {selCountry.flag} {selCountry.name} ✕
                  </button>
                )}
              </CardTitle>
              <div className="inline-flex overflow-hidden rounded-md border border-border">
                {METRICS.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.key}
                      onClick={() => setMetric(m.key)}
                      className={
                        "inline-flex items-center gap-1 px-2.5 py-1 text-xs " +
                        (metric === m.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")
                      }
                      title={`Size bubbles by ${m.label.toLowerCase()}`}
                    >
                      <Icon className="h-3 w-3" /> {m.label}
                    </button>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent>
              <WorldBubbleMap geo={geo} metric={metric} selected={selected} onSelect={setSelected} />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {geo.continents
                    .filter((c) => c.visitors > 0 || c.revenue > 0)
                    .map((c) => (
                      <span key={c.continent} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: contColor(c.continent) }} />
                        {c.continent}
                      </span>
                    ))}
                </div>
                <span className="text-[11px] text-muted-foreground">Bubble size ∝ {metricLabel.toLowerCase()} · click to filter</span>
              </div>
            </CardContent>
          </Card>

          {/* Top countries bar + continent donut */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Top countries by {metricLabel.toLowerCase()}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topCountries} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={AXIS}
                        tickLine={false}
                        axisLine={{ stroke: GRID }}
                        tickFormatter={(v) => (metric === "revenue" ? `$${fmtCompact(v)}` : fmtCompact(v))}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={AXIS}
                        tickLine={false}
                        axisLine={false}
                        width={116}
                        tickFormatter={(v: string, i: number) => `${topCountries[i]?.flag ?? ""} ${v}`}
                      />
                      <Tooltip
                        {...TOOLTIP}
                        cursor={{ fill: "hsl(220 8% 12%)" }}
                        formatter={(v: number) => [barValue(v), metricLabel]}
                      />
                      <Bar dataKey="_v" radius={[0, 4, 4, 0]} maxBarSize={22} onClick={(d: { iso2?: string }) => setSelected(d?.iso2 ?? null)}>
                        {topCountries.map((c) => (
                          <Cell
                            key={c.iso2}
                            fill={contColor(c.continent)}
                            fillOpacity={selected && selected !== c.iso2 ? 0.35 : 1}
                            cursor="pointer"
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Visitors by region</CardTitle>
              </CardHeader>
              <CardContent>
                {continentDonut.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">No regional visitors yet.</div>
                ) : (
                  <>
                    <div className="h-52 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={continentDonut}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={52}
                            outerRadius={80}
                            paddingAngle={2}
                            stroke="hsl(220 8% 7%)"
                            strokeWidth={2}
                          >
                            {continentDonut.map((d) => (
                              <Cell key={d.name} fill={contColor(d.name)} />
                            ))}
                          </Pie>
                          <Tooltip {...TOOLTIP} formatter={(v: number, n: string) => [`${fmtNum(v)} visitors`, n]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-1 flex flex-col gap-1.5">
                      {continentDonut
                        .slice()
                        .sort((a, b) => b.value - a.value)
                        .map((d) => (
                          <div key={d.name} className="flex items-center gap-2 text-xs">
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: contColor(d.name) }} />
                            <span className="flex-1 text-muted-foreground">{d.name}</span>
                            <span className="tabular-nums">{fmtNum(d.value)}</span>
                            <span className="w-20 text-right tabular-nums text-muted-foreground">{fmtMoney(d.revenue, geo.currency)}</span>
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Revenue by region + time trend */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Revenue by region</CardTitle>
              </CardHeader>
              <CardContent>
                {revenueByRegion.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">No revenue booked yet.</div>
                ) : (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueByRegion} margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} angle={-18} textAnchor="end" height={54} />
                        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => `$${fmtCompact(v)}`} />
                        <Tooltip {...TOOLTIP} cursor={{ fill: "hsl(220 8% 12%)" }} formatter={(v: number) => [fmtMoney(v, geo.currency), "Revenue"]} />
                        <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={48}>
                          {revenueByRegion.map((d) => (
                            <Cell key={d.name} fill={contColor(d.name)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Activity trend · last {days}d
                  {selCountry && <Badge variant="muted">{selCountry.flag} {selCountry.name}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {geo.trend.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">No dated activity in this window.</div>
                ) : (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={geo.trend} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={20} />
                        <YAxis yAxisId="l" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={fmtCompact} />
                        <YAxis yAxisId="r" orientation="right" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => `$${fmtCompact(v)}`} />
                        <Tooltip
                          {...TOOLTIP}
                          formatter={(v: number, n: string) => [n === "revenue" ? fmtMoney(v, geo.currency) : fmtNum(v), n === "visitors" ? "Visitors" : n === "orders" ? "Orders" : "Revenue"]}
                        />
                        <Bar yAxisId="l" dataKey="visitors" fill="hsl(210 80% 58%)" radius={[3, 3, 0, 0]} maxBarSize={26} />
                        <Bar yAxisId="l" dataKey="orders" fill="hsl(142 58% 46%)" radius={[3, 3, 0, 0]} maxBarSize={26} />
                        <Line yAxisId="r" type="monotone" dataKey="revenue" stroke="hsl(38 92% 55%)" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(210 80% 58%)" }} /> Visitors</span>
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(142 58% 46%)" }} /> Orders</span>
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(38 92% 55%)" }} /> Revenue</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tables */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" /> Countries
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-8">#</TH>
                      <TH>Country</TH>
                      <TH className="text-right">Visitors</TH>
                      <TH className="text-right">Orders</TH>
                      <TH className="text-right">Revenue</TH>
                      <TH className="w-24">Share</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {geo.countries.slice(0, 14).map((c, i) => {
                      const isSel = selected === c.iso2;
                      return (
                        <TR
                          key={c.iso2}
                          className={"cursor-pointer " + (isSel ? "bg-accent/60" : "hover:bg-accent/40")}
                          onClick={() => setSelected(isSel ? null : c.iso2)}
                        >
                          <TD className="tabular-nums text-muted-foreground">{i + 1}</TD>
                          <TD>
                            <div className="flex items-center gap-2">
                              <span className="text-base leading-none">{c.flag}</span>
                              <div className="min-w-0">
                                <div className="truncate font-medium">{c.name}</div>
                                <div className="text-[11px] text-muted-foreground">{c.continent}</div>
                              </div>
                            </div>
                          </TD>
                          <TD className="text-right tabular-nums">{fmtNum(c.visitors)}</TD>
                          <TD className="text-right tabular-nums">{fmtNum(c.orders)}</TD>
                          <TD className="text-right tabular-nums font-medium">{c.revenue ? fmtMoney(c.revenue, geo.currency) : "—"}</TD>
                          <TD>
                            <MeterBar value={c.visitors} max={geo.countries[0]?.visitors || 1} />
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" /> Cities
                  {selCountry && <span className="text-xs font-normal text-muted-foreground">· {selCountry.name}</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cities.length === 0 ? (
                  <Empty icon={<Building2 className="h-7 w-7" />} title="No city-level data" hint="Cities appear once events or orders carry a city." />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH className="w-8">#</TH>
                        <TH>City</TH>
                        <TH className="text-right">Visitors</TH>
                        <TH className="text-right">Orders</TH>
                        <TH className="text-right">Revenue</TH>
                        <TH className="w-24">Rev share</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {cities.map((c, i) => (
                        <TR key={`${c.iso2}-${c.city}`}>
                          <TD className="tabular-nums text-muted-foreground">{i + 1}</TD>
                          <TD>
                            <div className="flex items-center gap-2">
                              <span className="text-sm leading-none">{flagEmoji(c.iso2)}</span>
                              <div className="min-w-0">
                                <div className="truncate font-medium">{c.city}</div>
                                <div className="text-[11px] text-muted-foreground">{c.countryName}</div>
                              </div>
                            </div>
                          </TD>
                          <TD className="text-right tabular-nums">{fmtNum(c.visitors)}</TD>
                          <TD className="text-right tabular-nums">{fmtNum(c.orders)}</TD>
                          <TD className="text-right tabular-nums font-medium">{c.revenue ? fmtMoney(c.revenue, geo.currency) : "—"}</TD>
                          <TD>
                            <MeterBar value={c.revenue} max={cityRevMax} tone="ok" />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
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
