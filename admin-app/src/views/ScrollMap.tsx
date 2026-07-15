import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MoveVertical, RefreshCw } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchTelemetry, type TelemetryEvent } from "@/lib/ecommerce";
import { buildScrollMap, type DepthBand, type PageScroll } from "@/lib/scrollmap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { cn } from "@/lib/utils";

const ACCENT = "#4b93ff";
const GRID = "#262a30";
const AXIS = "#9aa0a6";

/** Classic scroll-heat scale: hot (red) = many sessions, cold (blue) = few. */
function reachColor(reach: number, alpha = 1): string {
  const hue = 220 - (220 * Math.max(0, Math.min(100, reach))) / 100; // 220→0
  return `hsl(${hue.toFixed(0)} 85% 55% / ${alpha})`;
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

export function ScrollMap({
  config,
  events: provided,
}: {
  config: AppConfig;
  events?: TelemetryEvent[];
}) {
  const [events, setEvents] = useState<TelemetryEvent[]>(provided ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const selfFetch = provided === undefined;

  const load = useCallback(async () => {
    if (!selfFetch) return;
    setLoading(true);
    setError(null);
    try {
      setEvents(await fetchTelemetry(config));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [config, selfFetch]);

  useEffect(() => {
    if (selfFetch) load();
  }, [selfFetch, load]);

  useEffect(() => {
    if (provided) setEvents(provided);
  }, [provided]);

  const pages = useMemo(() => buildScrollMap(events), [events]);

  // Keep a valid selection as data changes.
  const page: PageScroll | undefined = useMemo(() => {
    if (pages.length === 0) return undefined;
    return pages.find((p) => p.page === selected) ?? pages[0];
  }, [pages, selected]);

  const hasData = pages.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Scroll-depth map</h1>
          <p className="text-xs text-muted-foreground">
            % of each page's sessions that scrolled past every depth band — top (0%) to
            bottom (100%). Derived from the stable Telemetry sheet.
          </p>
        </div>
        {selfFetch && (
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        )}
      </div>

      {error ? (
        <Empty title="Couldn't load telemetry" hint={error} />
      ) : !hasData ? (
        <Empty
          icon={<MoveVertical className="h-8 w-8" />}
          title="No scroll telemetry yet"
          hint="Pages will appear here once sessions emit page-view or scroll events with a pageUrl."
        />
      ) : (
        <>
          {/* Page selector */}
          <div className="flex flex-wrap gap-1.5">
            {pages.map((p) => {
              const active = p.page === page?.page;
              return (
                <button
                  key={p.page}
                  onClick={() => setSelected(p.page)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition-colors",
                    active
                      ? "border-primary/40 bg-primary/15 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                  title={p.url}
                >
                  <span className="max-w-[220px] truncate font-medium">{p.page}</span>
                  <span className="tabular-nums opacity-70">{p.sessions}</span>
                </button>
              );
            })}
          </div>

          {page && <PagePanel page={page} />}

          {/* All-pages summary */}
          <Card>
            <CardHeader>
              <CardTitle>All pages · depth reach</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Page</TH>
                    <TH className="text-right">Sessions</TH>
                    <TH className="text-right">Median depth</TH>
                    <TH>25% / 50% / 75% still reading at</TH>
                    <TH className="text-right">Reached bottom</TH>
                  </TR>
                </THead>
                <TBody>
                  {pages.map((p) => {
                    const bottom = p.bands[p.bands.length - 1]?.reach ?? 0;
                    return (
                      <TR
                        key={p.page}
                        className={cn(
                          "cursor-pointer",
                          p.page === page?.page && "bg-accent/40",
                        )}
                        onClick={() => setSelected(p.page)}
                      >
                        <TD className="max-w-[260px] truncate font-medium" title={p.url}>
                          {p.page}
                        </TD>
                        <TD className="text-right tabular-nums text-muted-foreground">
                          {p.sessions}
                        </TD>
                        <TD className="text-right tabular-nums">{pct(p.medianDepth)}</TD>
                        <TD>
                          <MiniReach page={p} />
                        </TD>
                        <TD className="text-right tabular-nums text-muted-foreground">
                          {pct(bottom)}
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
    </div>
  );
}

function PagePanel({ page }: { page: PageScroll }) {
  const bottom = page.bands[page.bands.length - 1]?.reach ?? 0;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Fold / reach curve */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Fold-line reach · {page.page}</CardTitle>
          <span className="text-[11px] text-muted-foreground">
            {page.sessions} sessions · {page.scrollSessions} scrolled
          </span>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <HeatRail bands={page.bands} />
            <div className="h-72 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={page.bands}
                  layout="vertical"
                  margin={{ top: 6, right: 16, bottom: 6, left: 0 }}
                >
                  <defs>
                    <linearGradient id="reachFill" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} strokeDasharray="2 4" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fill: AXIS, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="number"
                    dataKey="depth"
                    reversed
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tickFormatter={(v) => `${v}%`}
                    width={40}
                    tick={{ fill: AXIS, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ stroke: GRID }}
                    contentStyle={{
                      background: "#14161a",
                      border: "1px solid #262a30",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number, _n, item) => [
                      `${Math.round(value)}%  (${(item?.payload as DepthBand)?.sessions ?? 0} sessions)`,
                      "reach",
                    ]}
                    labelFormatter={(d) => `Depth ${d}%`}
                  />
                  {page.foldDepth != null && (
                    <ReferenceLine
                      y={page.foldDepth}
                      stroke="#f0b429"
                      strokeDasharray="4 3"
                      label={{
                        value: `avg fold ${pct(page.foldDepth)}`,
                        position: "insideRight",
                        fill: "#f0b429",
                        fontSize: 10,
                      }}
                    />
                  )}
                  <ReferenceLine
                    y={page.medianDepth}
                    stroke={AXIS}
                    strokeDasharray="4 3"
                    label={{
                      value: `median ${pct(page.medianDepth)}`,
                      position: "insideLeft",
                      fill: AXIS,
                      fontSize: 10,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="reach"
                    stroke={ACCENT}
                    strokeWidth={2}
                    fill="url(#reachFill)"
                    isAnimationActive={false}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Top of page is at 0%. Each point is the share of sessions whose deepest scroll
            reached that far down.
          </p>
        </CardContent>
      </Card>

      {/* KPIs */}
      <Card>
        <CardHeader>
          <CardTitle>At a glance</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Stat label="Sessions" value={String(page.sessions)} />
          <Stat label="Scrolled" value={pct((page.scrollSessions / page.sessions) * 100)} />
          <Stat label="Median depth" value={pct(page.medianDepth)} />
          <Stat label="Avg depth" value={pct(page.avgDepth)} />
          <Stat label="½ still reading at" value={pct(page.reach50)} />
          <Stat label="Reached bottom" value={pct(bottom)} />
          {page.foldDepth != null && (
            <Stat label="Avg fold" value={pct(page.foldDepth)} accent />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Vertical heat column, hot (red) where most sessions are present. */
function HeatRail({ bands }: { bands: DepthBand[] }) {
  return (
    <div className="flex w-6 flex-col overflow-hidden rounded-md border border-border">
      {bands
        .filter((b) => b.depth < 100)
        .map((b) => (
          <div
            key={b.depth}
            className="flex-1"
            style={{ background: reachColor(b.reach, 0.85) }}
            title={`${b.depth}% depth · ${Math.round(b.reach)}% reach`}
          />
        ))}
    </div>
  );
}

/** Compact 0→100 reach strip used in the summary table. */
function MiniReach({ page }: { page: PageScroll }) {
  const marks = [
    { t: 25, d: page.reach25 },
    { t: 50, d: page.reach50 },
    { t: 75, d: page.reach75 },
  ];
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-40 overflow-hidden rounded-full bg-muted">
        {page.bands
          .filter((b) => b.depth < 100)
          .map((b) => (
            <div
              key={b.depth}
              className="absolute top-0 h-full"
              style={{
                left: `${b.depth}%`,
                width: `${100 / (page.bands.length - 1)}%`,
                background: reachColor(b.reach, 0.9),
              }}
            />
          ))}
      </div>
      <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
        {marks.map((m) => pct(m.d)).join(" / ")}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2.5">
      <div className={cn("text-xl font-semibold tabular-nums", accent && "text-warn")}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
