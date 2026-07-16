/**
 * DashboardView — the admin home. A KPI snapshot built from the shared analytics
 * data hook (Telemetry + Orders, with the deterministic seed fallback) plus the
 * live backend health passed down from the shell:
 *   • headline tiles — today's sales, orders, sessions and conversion (vs
 *     yesterday),
 *   • a 14-day sales trend,
 *   • top products and most-recent orders,
 *   • a backend health strip with an AI-outage callout,
 *   • quick links into the main sections.
 */
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  ClipboardList,
  DollarSign,
  Gauge,
  Megaphone,
  Package,
  RefreshCw,
  ShoppingCart,
  Users,
} from "lucide-react";
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import { buildLeaderboard, type LeaderRow } from "@/lib/leaderboard";
import { useAnalyticsData } from "@/views/analytics/useAnalyticsData";
import { StatTile, MeterBar } from "@/views/analytics/shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/Empty";
import { StatusDot } from "@/components/StatusDot";
import { fmtMoney, timeAgo } from "@/lib/utils";
import type { NavCtx } from "@/nav/model";

const DAY = 86_400_000;

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function orderValue(o: Order): number {
  return toNum(o.price) * (toNum(o.quantity) || 1);
}
function dayKey(ts?: string): string {
  const t = Date.parse(ts ?? "");
  if (Number.isNaN(t)) return "";
  return new Date(t).toISOString().slice(0, 10);
}
function sessKey(e: TelemetryEvent): string {
  return String(e.sessionId ?? e.anonymousId ?? "");
}
const PAGE_VIEW_RE = /page_?view|screen_?view|visit|session_?start|impression/;
function isPageView(e: TelemetryEvent): boolean {
  return PAGE_VIEW_RE.test(String(e.event ?? e.eventType ?? "").toLowerCase());
}
function isAiOutage(e: TelemetryEvent): boolean {
  return /ai_?outage|ai_?error|llm_?error/.test(String(e.event ?? e.eventType ?? "").toLowerCase());
}
const nf = (n: number) => Math.round(n).toLocaleString("en-US");
function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value == null) return <span className="text-[11px] text-muted-foreground">—</span>;
  const good = invert ? value <= 0 : value >= 0;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
        good ? "text-ok" : "text-down"
      }`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(0)}%
    </span>
  );
}

const QUICK_LINKS: { key: string; label: string; icon: typeof BarChart3 }[] = [
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "catalog", label: "Catalog", icon: Boxes },
  { key: "orders", label: "Orders", icon: ClipboardList },
  { key: "customers", label: "Customers", icon: Users },
  { key: "marketing", label: "Marketing", icon: Megaphone },
];

export function DashboardView({ ctx }: { ctx: NavCtx }) {
  const { config, statuses, goto } = ctx;
  const { events, orders, seeded, loading, refresh } = useAnalyticsData(config);

  const m = useMemo(() => {
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const yesterday = new Date(now - DAY).toISOString().slice(0, 10);

    let salesToday = 0;
    let salesYest = 0;
    let ordersToday = 0;
    let ordersYest = 0;
    let currency = "USD";
    for (const o of orders) {
      const d = dayKey(o.timestamp);
      if (o.currency) currency = String(o.currency);
      if (d === today) {
        salesToday += orderValue(o);
        ordersToday++;
      } else if (d === yesterday) {
        salesYest += orderValue(o);
        ordersYest++;
      }
    }

    const sessToday = new Set<string>();
    const sessYest = new Set<string>();
    let aiOutages = 0;
    for (const e of events) {
      const d = dayKey(e.timestamp);
      const sk = sessKey(e);
      if (d === today && sk) sessToday.add(sk);
      else if (d === yesterday && sk) sessYest.add(sk);
      if (isAiOutage(e)) {
        const t = Date.parse(e.timestamp ?? "");
        if (!Number.isNaN(t) && now - t < DAY) aiOutages++;
      }
    }
    void isPageView; // reserved for future page-view KPI

    const rateToday = sessToday.size ? (ordersToday / sessToday.size) * 100 : 0;
    const rateYest = sessYest.size ? (ordersYest / sessYest.size) * 100 : 0;

    const delta = (a: number, b: number): number | null =>
      b === 0 ? (a > 0 ? null : 0) : ((a - b) / b) * 100;

    // 14-day sales trend.
    const byDay = new Map<string, number>();
    for (const o of orders) {
      const d = dayKey(o.timestamp);
      if (!d) continue;
      byDay.set(d, (byDay.get(d) ?? 0) + orderValue(o));
    }
    const trend: { label: string; sales: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * DAY).toISOString().slice(0, 10);
      trend.push({
        label: new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
        sales: byDay.get(d) ?? 0,
      });
    }

    const board = buildLeaderboard(events, orders, "revenue");
    const topProducts: LeaderRow[] = board.rows.slice(0, 5);

    const recent = [...orders]
      .filter((o) => o.timestamp)
      .sort((a, b) => Date.parse(String(b.timestamp)) - Date.parse(String(a.timestamp)))
      .slice(0, 6);

    return {
      currency,
      salesToday,
      ordersToday,
      sessionsToday: sessToday.size,
      rateToday,
      aiOutages,
      deltas: {
        sales: delta(salesToday, salesYest),
        orders: delta(ordersToday, ordersYest),
        sessions: delta(sessToday.size, sessYest.size),
        rate: delta(rateToday, rateYest),
      },
      trend,
      topProducts,
      recent,
    };
  }, [events, orders]);

  const maxSales = Math.max(...m.trend.map((t) => t.sales), 1);
  const maxProdRev = Math.max(...m.topProducts.map((p) => p.revenue), 1);
  const anyDown = statuses.some((s) => s.health === "down");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Gauge className="h-5 w-5 text-primary" /> Dashboard
            {seeded && (
              <Badge variant="warn" title="Showing deterministic seed data until the read endpoint is live.">
                seed data
              </Badge>
            )}
          </h1>
          <p className="text-xs text-muted-foreground">
            Today at a glance — sales, orders, traffic and backend health.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {/* AI-outage / health callout */}
      {(m.aiOutages > 0 || anyDown) && (
        <div className="flex items-center gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {m.aiOutages > 0 && <b>{m.aiOutages} AI outage event(s)</b>}
            {m.aiOutages > 0 && anyDown && " · "}
            {anyDown && <b>one or more backends are down</b>}
            {" — "}check the Ops health board.
          </span>
          <button
            onClick={() => goto("ops", "health")}
            className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:bg-warn/20"
          >
            Open <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Sales today"
          value={fmtMoney(m.salesToday, m.currency)}
          tone="primary"
          sub={<Delta value={m.deltas.sales} />}
        />
        <StatTile label="Orders today" value={nf(m.ordersToday)} sub={<Delta value={m.deltas.orders} />} />
        <StatTile
          label="Sessions today"
          value={nf(m.sessionsToday)}
          tone="ok"
          sub={<Delta value={m.deltas.sessions} />}
        />
        <StatTile
          label="Conversion today"
          value={pct(m.rateToday)}
          sub={<Delta value={m.deltas.rate} />}
        />
      </div>

      {/* Sales trend */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" /> Sales — last 14 days
            </CardTitle>
          </div>
          <button
            onClick={() => goto("analytics", "reports")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Full reports <ArrowRight className="h-3 w-3" />
          </button>
        </CardHeader>
        <CardContent>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={m.trend} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="dash-sales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(4 65% 54%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(4 65% 54%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#9aa0a6", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(220 6% 16%)" }}
                  minTickGap={20}
                />
                <YAxis
                  tick={{ fill: "#9aa0a6", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(220 8% 7%)",
                    border: "1px solid hsl(220 6% 16%)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#e8e8e8" }}
                  formatter={(v: number) => [fmtMoney(v, m.currency), "Sales"]}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="hsl(4 65% 54%)"
                  strokeWidth={2}
                  fill="url(#dash-sales)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top products + recent orders */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" /> Top products
            </CardTitle>
            <button
              onClick={() => goto("analytics", "reports")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              More
            </button>
          </CardHeader>
          <CardContent>
            {m.topProducts.length === 0 ? (
              <Empty icon={<Package className="h-7 w-7" />} title="No product telemetry yet" />
            ) : (
              <div className="flex flex-col gap-2.5">
                {m.topProducts.map((p, i) => (
                  <div key={p.productId} className="flex items-center gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-[11px] font-semibold tabular-nums text-muted-foreground">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground" title={p.name}>
                        {p.name}
                      </div>
                      <div className="mt-1">
                        <MeterBar value={p.revenue} max={maxProdRev} tone="primary" />
                      </div>
                    </div>
                    <div className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                      {p.revenue ? fmtMoney(p.revenue, p.currency) : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" /> Recent orders
            </CardTitle>
            <button
              onClick={() => goto("orders", "pipeline")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Open orders
            </button>
          </CardHeader>
          <CardContent>
            {m.recent.length === 0 ? (
              <Empty icon={<ShoppingCart className="h-7 w-7" />} title="No orders yet" />
            ) : (
              <div className="flex flex-col divide-y divide-border/60">
                {m.recent.map((o, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {o.productName || o.sku || "(item)"}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {o.customerName || o.email || "—"} · {timeAgo(o.timestamp ?? "")}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                      {fmtMoney(orderValue(o), o.currency || m.currency)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Backend health + quick links */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" /> Backend health
            </CardTitle>
            <button
              onClick={() => goto("ops", "health")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Health board
            </button>
          </CardHeader>
          <CardContent>
            {statuses.length === 0 ? (
              <div className="text-sm text-muted-foreground">Checking services…</div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {statuses.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2"
                  >
                    <StatusDot health={s.health} />
                    <span className="min-w-0 flex-1 truncate text-sm">{s.label}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {s.latencyMs != null ? `${s.latencyMs}ms` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Jump to</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QUICK_LINKS.map((l) => {
                const Icon = l.icon;
                return (
                  <button
                    key={l.key}
                    onClick={() => goto(l.key)}
                    className="group flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                    {l.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
