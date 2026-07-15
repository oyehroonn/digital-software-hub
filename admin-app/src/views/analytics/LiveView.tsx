/**
 * LIVE VIEW — the real-time command centre for the store.
 *
 * A premium, always-moving dashboard of what is happening on the site right
 * NOW: the current visitor count, a live sessions feed, orders animating in as
 * they land, the top active pages, today-vs-yesterday sales & sessions, and a
 * visitors-by-location strip built from the last ~5 minutes of telemetry.
 *
 * Data comes from the STABLE Telemetry + Orders sheets via `useAnalyticsData`
 * (deterministic-seed fallback so it lights up before the read endpoint is
 * deployed). It re-fetches every ~15s and re-derives against a 1s ticking clock
 * so "active in the last 5 min" and "12s ago" stay honest without a manual
 * refresh. Unlike the report pages this view is fixed to "now" — it does not
 * consume the global date range.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Radio,
  Users,
  ShoppingCart,
  Eye,
  MousePointerClick,
  Search,
  CreditCard,
  Receipt,
  Zap,
  AlertTriangle,
  Activity,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Globe2,
  FileText,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import { buildRealtime, type LiveKind } from "@/lib/realtime";
import { metaOf, metaPick, pagePath, sessionOf, str, timeOf } from "@/lib/telemetryFields";
import { flagEmoji } from "@/lib/geo";
import { fmtMoney, cn } from "@/lib/utils";
import { useAnalyticsData } from "./useAnalyticsData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { StatusDot } from "@/components/StatusDot";

const DAY = 86_400_000;
const ACTIVE_WINDOW = 5 * 60_000;

const KIND_ICON: Record<LiveKind, typeof Eye> = {
  view: Eye,
  click: MousePointerClick,
  search: Search,
  cart: ShoppingCart,
  checkout: CreditCard,
  order: Receipt,
  rage: Zap,
  outage: AlertTriangle,
  other: Activity,
};
const KIND_TONE: Record<LiveKind, string> = {
  view: "text-muted-foreground",
  click: "text-primary",
  search: "text-primary",
  cart: "text-warn",
  checkout: "text-warn",
  order: "text-ok",
  rage: "text-down",
  outage: "text-down",
  other: "text-muted-foreground",
};

function ago(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const ordTime = (o: Order): number => Date.parse(String(o.timestamp ?? o.received_at ?? ""));
const ordRevenue = (o: Order): number => {
  const p = typeof o.price === "number" ? o.price : parseFloat(String(o.price ?? "0").replace(/[^0-9.\-]/g, ""));
  const q = typeof o.quantity === "number" ? o.quantity : parseFloat(String(o.quantity ?? "1"));
  return (Number.isFinite(p) ? p : 0) * (Number.isFinite(q) && q > 0 ? q : 1);
};

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Signed today-vs-yesterday delta chip. */
function LiveDelta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev) {
    return <span className="text-[11px] font-medium text-muted-foreground">{cur > 0 ? "new" : "—"}</span>;
  }
  const d = (cur - prev) / prev;
  const up = d >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums", up ? "text-ok" : "text-down")}>
      <Icon className="h-3 w-3" />
      {Math.abs(d * 100).toFixed(Math.abs(d) < 0.1 ? 1 : 0)}%
    </span>
  );
}

export function LiveView({ config }: { config: AppConfig }) {
  const { events, orders, seeded, loading, liveCount, refresh } = useAnalyticsData(config);
  const [now, setNow] = useState(() => Date.now());

  // Tick the clock every 1s; re-fetch telemetry + orders every 15s.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => refresh(), 15000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [refresh]);

  const rt = useMemo(() => buildRealtime(events, now, { activeWindowMs: ACTIVE_WINDOW, recentLimit: 40 }), [events, now]);
  const maxMin = Math.max(1, ...rt.perMinute.map((m) => m.count));

  // Today vs yesterday (sessions + sales), fixed to the wall clock.
  const compare = useMemo(() => {
    const todayStart = startOfDay(now);
    const yStart = todayStart - DAY;
    const sT = new Set<string>();
    const sY = new Set<string>();
    events.forEach((e, i) => {
      const t = timeOf(e);
      if (!Number.isFinite(t)) return;
      if (t >= todayStart) sT.add(sessionOf(e, i));
      else if (t >= yStart) sY.add(sessionOf(e, i));
    });
    let salesToday = 0;
    let salesYest = 0;
    let ordersYest = 0;
    let currency = "USD";
    for (const o of orders) {
      const t = ordTime(o);
      if (o.currency) currency = String(o.currency);
      if (!Number.isFinite(t)) continue;
      if (t >= todayStart) salesToday += ordRevenue(o);
      else if (t >= yStart) {
        salesYest += ordRevenue(o);
        ordersYest += 1;
      }
    }
    return {
      sessionsToday: sT.size,
      sessionsYest: sY.size,
      salesToday,
      salesYest,
      ordersYest,
      currency,
    };
  }, [events, orders, now]);

  // Top active pages right now (sessions active in the last 5 min).
  const topPages = useMemo(() => {
    const map = new Map<string, Set<string>>();
    events.forEach((e, i) => {
      const t = timeOf(e);
      if (!Number.isFinite(t) || now - t > ACTIVE_WINDOW || now - t < 0) return;
      const p = pagePath(e);
      (map.get(p) ?? map.set(p, new Set()).get(p)!).add(sessionOf(e, i));
    });
    const rows = [...map.entries()].map(([page, s]) => ({ page, count: s.size })).sort((a, b) => b.count - a.count);
    const max = rows[0]?.count ?? 1;
    return { rows: rows.slice(0, 7), max };
  }, [events, now]);

  // Visitors by location (last 5 min).
  const locations = useMemo(() => {
    const map = new Map<string, { cc: string; sessions: Set<string>; cities: Set<string> }>();
    events.forEach((e, i) => {
      const t = timeOf(e);
      if (!Number.isFinite(t) || now - t > ACTIVE_WINDOW || now - t < 0) return;
      const m = metaOf(e);
      const cc = str(metaPick(m, "country", "countryCode", "geoCountry")).toUpperCase() || "??";
      const city = str(metaPick(m, "city", "geoCity"));
      const rec = map.get(cc) ?? { cc, sessions: new Set<string>(), cities: new Set<string>() };
      rec.sessions.add(sessionOf(e, i));
      if (city) rec.cities.add(city);
      map.set(cc, rec);
    });
    return [...map.values()]
      .map((r) => ({ cc: r.cc, count: r.sessions.size, city: [...r.cities][0] ?? "" }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [events, now]);

  // Recent orders (stable list; agoMs computed at render). Newly-arrived flash.
  const orderRows = useMemo(() => {
    return orders
      .map((o, i) => ({
        id: `${o.email ?? ""}-${o.productId ?? o.sku ?? ""}-${o.timestamp ?? o.received_at ?? i}`,
        name: String(o.productName ?? o.productId ?? o.sku ?? "Order"),
        who: String(o.customerName ?? o.email ?? "Someone").split("@")[0],
        revenue: ordRevenue(o),
        currency: String(o.currency ?? "USD"),
        cc: String(o.country ?? "").toUpperCase(),
        city: String(o.city ?? ""),
        t: ordTime(o),
      }))
      .filter((o) => Number.isFinite(o.t))
      .sort((a, b) => b.t - a.t)
      .slice(0, 12);
  }, [orders]);

  const primed = useRef(false);
  const seen = useRef<Set<string>>(new Set());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const fresh: string[] = [];
    for (const o of orderRows) {
      if (!seen.current.has(o.id)) {
        seen.current.add(o.id);
        if (primed.current) fresh.push(o.id);
      }
    }
    primed.current = true;
    if (!fresh.length) return;
    setFlashIds((prev) => new Set([...prev, ...fresh]));
    const timer = setTimeout(() => {
      setFlashIds((prev) => {
        const next = new Set(prev);
        for (const id of fresh) next.delete(id);
        return next;
      });
    }, 3500);
    return () => clearTimeout(timer);
  }, [orderRows]);

  return (
    <div className="flex flex-col gap-4">
      {/* Scoped keyframes for the real-time motion. */}
      <style>{`
        @keyframes dsm-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes dsm-flash { 0% { background: hsl(142 58% 46% / 0.28); } 100% { background: transparent; } }
        @keyframes dsm-sheen { 0% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
        .dsm-rise { animation: dsm-rise .32s ease-out both; }
        .dsm-flash { animation: dsm-flash 3.2s ease-out both; }
      `}</style>

      {/* ---- Hero: live status + active-now count ---- */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-5">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-ok/15">
              <StatusDot health="up" pulse />
              <Radio className="absolute h-5 w-5 text-ok" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">Live view</h1>
                <Badge variant="ok" className="gap-1">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ok" /> LIVE
                </Badge>
                {seeded && (
                  <Badge variant="warn" title="Read endpoint returned no rows — showing the deterministic seed.">
                    seed data
                  </Badge>
                )}
                {seeded === false && liveCount > 0 && <Badge variant="ok">live · {liveCount.toLocaleString("en-US")}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                Real-time activity across the store · refreshes every 15s{loading ? " · syncing…" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Visitors right now</div>
              <div className="flex items-center justify-end gap-2">
                <Users className="h-6 w-6 text-ok" />
                <span key={rt.activeCount} className="dsm-rise text-5xl font-bold tabular-nums leading-none text-foreground">
                  {rt.activeCount}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">active in the last 5 min</div>
            </div>
          </div>
        </div>

        {/* events-per-minute pulse */}
        <div className="relative mt-5">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>Events per minute · last 30 min</span>
            <span className="tabular-nums">peak {maxMin}/min</span>
          </div>
          <div className="flex h-16 items-end gap-[3px]">
            {rt.perMinute.map((m) => (
              <div
                key={m.minute}
                className="flex-1 rounded-t bg-gradient-to-t from-ok/40 to-ok transition-[height] duration-500"
                style={{ height: `${Math.max(3, (m.count / maxMin) * 100)}%` }}
                title={`${m.minute}m ago · ${m.count} events`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ---- KPI strip ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <LiveTile
          icon={<Users className="h-4 w-4" />}
          tone="ok"
          label="Sessions today"
          value={compare.sessionsToday.toLocaleString("en-US")}
          foot={<LiveDelta cur={compare.sessionsToday} prev={compare.sessionsYest} />}
          footLabel="vs yesterday"
        />
        <LiveTile
          icon={<DollarSign className="h-4 w-4" />}
          tone="warn"
          label="Sales today"
          value={fmtMoney(compare.salesToday, compare.currency)}
          foot={<LiveDelta cur={compare.salesToday} prev={compare.salesYest} />}
          footLabel="vs yesterday"
        />
        <LiveTile
          icon={<Receipt className="h-4 w-4" />}
          tone="primary"
          label="Orders today"
          value={rt.ordersToday.toLocaleString("en-US")}
          foot={<LiveDelta cur={rt.ordersToday} prev={compare.ordersYest} />}
          footLabel="vs yesterday"
        />
        <LiveTile
          icon={<Activity className="h-4 w-4" />}
          tone="default"
          label="Events / hour"
          value={rt.eventsLastHour.toLocaleString("en-US")}
          foot={<span className="text-[11px] text-muted-foreground">live pulse</span>}
          footLabel="trailing 60 min"
        />
      </div>

      {/* ---- Location strip ---- */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-primary" /> Visitors by location
          </CardTitle>
          <span className="text-[11px] text-muted-foreground">last 5 min</span>
        </CardHeader>
        <CardContent>
          {locations.length ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {locations.map((l) => (
                <div
                  key={l.cc}
                  className="dsm-rise flex min-w-[128px] shrink-0 items-center gap-2.5 rounded-lg border border-border bg-background/60 px-3 py-2"
                >
                  <span className="text-2xl leading-none">{flagEmoji(l.cc)}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold tabular-nums text-foreground">{l.count}</span>
                      <span className="text-xs text-muted-foreground">{l.cc}</span>
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{l.city || "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-muted-foreground">No located visitors in the last 5 minutes.</div>
          )}
        </CardContent>
      </Card>

      {/* ---- Feeds row ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Live sessions */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              <StatusDot health="up" pulse /> Active sessions
            </CardTitle>
            <span className="text-[11px] tabular-nums text-muted-foreground">{rt.activeCount} live</span>
          </CardHeader>
          <CardContent>
            {rt.activeSessions.length === 0 ? (
              <Empty icon={<Users className="h-8 w-8" />} title="No one active" hint="Sessions with an event in the last 5 min show here." />
            ) : (
              <div className="flex max-h-[440px] flex-col divide-y divide-border/50 overflow-y-auto">
                {rt.activeSessions.slice(0, 24).map((s) => (
                  <div key={s.sessionId} className="dsm-rise flex items-center gap-2.5 py-2">
                    <StatusDot health="up" pulse />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">#{s.shortSession}</span>
                        <span className="truncate text-sm text-foreground">{s.lastAction}</span>
                        {s.hasOrder && <Badge variant="ok">bought</Badge>}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {s.page} · {s.device} · {s.location}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{ago(s.agoMs)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Orders as they arrive */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-ok" /> Orders arriving
            </CardTitle>
            <span className="text-[11px] text-muted-foreground">newest first</span>
          </CardHeader>
          <CardContent>
            {orderRows.length === 0 ? (
              <Empty icon={<Receipt className="h-8 w-8" />} title="No orders yet" hint="New orders animate in here as they land." />
            ) : (
              <div className="flex max-h-[440px] flex-col gap-1.5 overflow-y-auto">
                {orderRows.map((o) => {
                  const isNew = flashIds.has(o.id);
                  return (
                    <div
                      key={o.id}
                      className={cn(
                        "relative overflow-hidden rounded-lg border px-3 py-2",
                        isNew ? "dsm-flash border-ok/40" : "border-border/70",
                      )}
                    >
                      {isNew && (
                        <span
                          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-ok/20 to-transparent"
                          style={{ animation: "dsm-sheen 1.1s ease-out" }}
                          aria-hidden
                        />
                      )}
                      <div className="relative flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-foreground">{o.name}</span>
                            {isNew && <Badge variant="ok">new</Badge>}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {o.cc && <span className="mr-1">{flagEmoji(o.cc)}</span>}
                            {o.who}
                            {o.city ? ` · ${o.city}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold tabular-nums text-ok">{fmtMoney(o.revenue, o.currency)}</div>
                          <div className="text-[11px] tabular-nums text-muted-foreground">{ago(now - o.t)} ago</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live event feed + top pages */}
        <div className="flex flex-col gap-4 lg:col-span-1">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Top active pages
              </CardTitle>
              <span className="text-[11px] text-muted-foreground">now</span>
            </CardHeader>
            <CardContent>
              {topPages.rows.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">No active pages right now.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {topPages.rows.map((p) => (
                    <div key={p.page} className="flex items-center gap-2">
                      <span className="w-40 truncate font-mono text-[11px] text-foreground">{p.page}</span>
                      <span className="relative h-2 flex-1 overflow-hidden rounded bg-muted">
                        <span
                          className="absolute inset-y-0 left-0 rounded bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-500"
                          style={{ width: `${Math.max(6, (p.count / topPages.max) * 100)}%` }}
                        />
                      </span>
                      <span className="w-6 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">{p.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-ok" /> Live event feed
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rt.recent.length === 0 ? (
                <Empty icon={<Activity className="h-8 w-8" />} title="No events yet" />
              ) : (
                <div className="flex max-h-[220px] flex-col divide-y divide-border/40 overflow-y-auto">
                  {rt.recent.map((e) => {
                    const Icon = KIND_ICON[e.kind];
                    return (
                      <div key={e.id} className="flex items-center gap-2.5 py-1.5">
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", KIND_TONE[e.kind])} />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{e.action}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{ago(e.agoMs)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LiveTile({
  icon,
  label,
  value,
  foot,
  footLabel,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  foot: React.ReactNode;
  footLabel: string;
  tone: "ok" | "warn" | "primary" | "default";
}) {
  const toneCls =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "primary" ? "text-primary" : "text-foreground";
  const bg =
    tone === "ok" ? "bg-ok/12" : tone === "warn" ? "bg-warn/12" : tone === "primary" ? "bg-primary/12" : "bg-muted";
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", bg, toneCls)}>{icon}</span>
          {label}
        </span>
        {foot}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums", toneCls)}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{footLabel}</div>
    </div>
  );
}
