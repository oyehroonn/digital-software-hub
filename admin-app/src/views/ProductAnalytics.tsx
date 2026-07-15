import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  DollarSign,
  Eye,
  MousePointerClick,
  Package,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchOrders, fetchTelemetry, type Order, type TelemetryEvent } from "@/lib/ecommerce";
import {
  buildProductAnalytics,
  eventsPerDay,
  type ProductStat,
} from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { cn, fmtMoney } from "@/lib/utils";

const CHART_TOOLTIP = {
  background: "hsl(220 8% 7%)",
  border: "1px solid hsl(220 6% 16%)",
  borderRadius: 8,
  fontSize: 12,
} as const;

type SortKey = keyof Pick<
  ProductStat,
  "name" | "views" | "clicks" | "ctr" | "conversions" | "revenue"
>;
type SortDir = "asc" | "desc";

/**
 * Per-product analytics: a sortable table (views · clicks · CTR · conversions ·
 * revenue) with a daily-views sparkline per row, plus an events/day time-series.
 * Reads the stable data layer (Telemetry + Orders sheets). Self-loading; pass
 * pre-fetched `events`/`orders` to avoid a duplicate round-trip.
 */
export function ProductAnalytics({
  config,
  events: eventsProp,
  orders: ordersProp,
}: {
  config: AppConfig;
  events?: TelemetryEvent[];
  orders?: Order[];
}) {
  const [events, setEvents] = useState<TelemetryEvent[]>(eventsProp ?? []);
  const [orders, setOrders] = useState<Order[]>(ordersProp ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selfLoad = eventsProp === undefined;

  const load = useCallback(async () => {
    if (!selfLoad) return;
    setLoading(true);
    setError(null);
    try {
      const [ev, ords] = await Promise.all([
        fetchTelemetry(config),
        fetchOrders(config).catch(() => [] as Order[]),
      ]);
      setEvents(ev);
      setOrders(ords);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [config, selfLoad]);

  useEffect(() => {
    if (selfLoad) load();
  }, [selfLoad, load]);

  // Keep in sync when a parent feeds pre-loaded data.
  useEffect(() => {
    if (eventsProp !== undefined) setEvents(eventsProp);
  }, [eventsProp]);
  useEffect(() => {
    if (ordersProp !== undefined) setOrders(ordersProp);
  }, [ordersProp]);

  const stats = useMemo(() => buildProductAnalytics(events, orders), [events, orders]);
  const series = useMemo(() => eventsPerDay(events), [events]);

  const totals = useMemo(() => {
    const views = stats.reduce((s, p) => s + p.views, 0);
    const clicks = stats.reduce((s, p) => s + p.clicks, 0);
    const conversions = stats.reduce((s, p) => s + p.conversions, 0);
    const revenue = stats.reduce((s, p) => s + p.revenue, 0);
    return {
      products: stats.length,
      views,
      clicks,
      conversions,
      revenue,
      ctr: views ? clicks / views : 0,
      currency: stats.find((p) => p.revenue > 0)?.currency ?? "USD",
    };
  }, [stats]);

  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const rows = [...stats];
    rows.sort((a, b) => {
      let cmp: number;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [stats, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Text defaults A→Z; numbers default high→low.
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {selfLoad && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Product analytics</h1>
            <p className="text-xs text-muted-foreground">
              Views, clicks, CTR, conversions & revenue per product — joined from the Telemetry
              and Orders sheets.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      )}

      {error ? (
        <Empty title="Couldn't load analytics" hint={error} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile
              icon={<Package className="h-4 w-4" />}
              label="Products tracked"
              value={totals.products.toLocaleString()}
            />
            <StatTile
              icon={<Eye className="h-4 w-4" />}
              label="Total views"
              value={totals.views.toLocaleString()}
            />
            <StatTile
              icon={<MousePointerClick className="h-4 w-4" />}
              label="Avg CTR"
              value={`${(totals.ctr * 100).toFixed(1)}%`}
            />
            <StatTile
              icon={<TrendingUp className="h-4 w-4" />}
              label="Conversions"
              value={totals.conversions.toLocaleString()}
            />
            <StatTile
              icon={<DollarSign className="h-4 w-4" />}
              label="Revenue"
              value={fmtMoney(totals.revenue, totals.currency)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Events per day</CardTitle>
            </CardHeader>
            <CardContent>
              {series.length === 0 ? (
                <Empty
                  icon={<TrendingUp className="h-8 w-8" />}
                  title="No dated telemetry yet"
                />
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 6% 16%)" vertical={false} />
                      <XAxis
                        dataKey="day"
                        tick={{ fill: "#9aa0a6", fontSize: 11 }}
                        tickFormatter={shortDay}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={24}
                      />
                      <YAxis
                        tick={{ fill: "#9aa0a6", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP}
                        cursor={{ stroke: "hsl(220 6% 30%)" }}
                        labelFormatter={(l) => shortDay(String(l))}
                      />
                      <Line
                        type="monotone"
                        dataKey="count"
                        name="Events"
                        stroke="hsl(4 65% 54%)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Per-product breakdown</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {sorted.length === 0 ? (
                <Empty icon={<Package className="h-8 w-8" />} title="No product events recorded" />
              ) : (
                <div className="rounded-lg border border-border">
                  <Table>
                    <THead>
                      <TR>
                        <SortableTH label="Product" col="name" {...{ sortKey, sortDir, toggleSort }} />
                        <SortableTH
                          label="Views"
                          col="views"
                          align="right"
                          {...{ sortKey, sortDir, toggleSort }}
                        />
                        <SortableTH
                          label="Clicks"
                          col="clicks"
                          align="right"
                          {...{ sortKey, sortDir, toggleSort }}
                        />
                        <SortableTH
                          label="CTR"
                          col="ctr"
                          align="right"
                          {...{ sortKey, sortDir, toggleSort }}
                        />
                        <SortableTH
                          label="Conv."
                          col="conversions"
                          align="right"
                          {...{ sortKey, sortDir, toggleSort }}
                        />
                        <SortableTH
                          label="Revenue"
                          col="revenue"
                          align="right"
                          {...{ sortKey, sortDir, toggleSort }}
                        />
                        <TH className="text-right">Trend</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {sorted.map((p) => (
                        <TR key={p.productId}>
                          <TD className="max-w-xs">
                            <div className="truncate font-medium">{p.name}</div>
                            <div className="text-[11px] text-muted-foreground">#{p.productId}</div>
                          </TD>
                          <TD className="text-right tabular-nums">{p.views.toLocaleString()}</TD>
                          <TD className="text-right tabular-nums">{p.clicks.toLocaleString()}</TD>
                          <TD className="text-right tabular-nums">
                            <CtrBadge ctr={p.ctr} hasViews={p.views > 0} />
                          </TD>
                          <TD className="text-right tabular-nums">{p.conversions.toLocaleString()}</TD>
                          <TD className="text-right tabular-nums">
                            {p.revenue > 0 ? fmtMoney(p.revenue, p.currency) : "—"}
                          </TD>
                          <TD className="text-right">
                            <div className="flex justify-end">
                              <Sparkline data={p.spark} />
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="opacity-70">{icon}</span>
          <span className="text-[11px] uppercase tracking-wide">{label}</span>
        </div>
        <div className="text-xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function SortableTH({
  label,
  col,
  align = "left",
  sortKey,
  sortDir,
  toggleSort,
}: {
  label: string;
  col: SortKey;
  align?: "left" | "right";
  sortKey: SortKey;
  sortDir: SortDir;
  toggleSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <TH className={align === "right" ? "text-right" : undefined}>
      <button
        onClick={() => toggleSort(col)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TH>
  );
}

function CtrBadge({ ctr, hasViews }: { ctr: number; hasViews: boolean }) {
  if (!hasViews) return <span className="text-muted-foreground">—</span>;
  const pct = ctr * 100;
  const tone =
    pct >= 15 ? "text-ok" : pct >= 5 ? "text-foreground" : "text-muted-foreground";
  return <span className={tone}>{pct.toFixed(1)}%</span>;
}

/** Dependency-light inline SVG sparkline (crisp at any row height). */
function Sparkline({
  data,
  width = 100,
  height = 26,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  if (!data.length || data.every((v) => v === 0)) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }
  const pad = 2;
  const max = Math.max(...data, 1);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  const pts = data.map((v, i) => {
    const x = pad + (data.length > 1 ? i * step : innerW / 2);
    const y = pad + innerH - (v / max) * innerH;
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height - pad} L${pts[0][0].toFixed(
    1,
  )},${height - pad} Z`;
  const last = pts[pts.length - 1];
  const gradId = `spark-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(4 65% 54%)" stopOpacity={0.28} />
          <stop offset="100%" stopColor="hsl(4 65% 54%)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke="hsl(4 65% 54%)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={1.8} fill="hsl(4 65% 54%)" />
    </svg>
  );
}

/** "2026-07-15" -> "Jul 15". */
function shortDay(s: string): string {
  const t = Date.parse(s);
  if (Number.isNaN(t)) return s;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
