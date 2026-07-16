/**
 * Real-time visitor feed. A live-ticking view of who is on the site right now,
 * what they just did, and the events-per-minute pulse. Auto-refetches telemetry
 * on an interval and re-derives against a ticking clock so "active in the last
 * 5 min" and "12s ago" stay honest without a manual refresh.
 */
import { useEffect, useMemo, useState } from "react";
import { Activity, ShoppingCart, MousePointerClick, Search, CreditCard, Receipt, Eye, Zap, AlertTriangle } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { buildRealtime, type LiveKind } from "@/lib/realtime";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader, AnalyticsEmpty, StatTile } from "./shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { StatusDot } from "@/components/StatusDot";
import { cn } from "@/lib/utils";

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

export function RealtimeFeedView({ config }: { config: AppConfig }) {
  const { events, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config, { orders: false });
  const [now, setNow] = useState(() => Date.now());

  // Tick the clock every 2s; refetch telemetry every 20s.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 2000);
    const poll = setInterval(() => refresh(), 20000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [refresh]);

  const rt = useMemo(() => buildRealtime(events, now), [events, now]);
  const maxMin = Math.max(...rt.perMinute.map((m) => m.count), 1);

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<Activity className="h-4 w-4 text-ok" />}
        title="Real-time visitors"
        subtitle="Who is on the site right now and what they just did — a live feed with the events-per-minute pulse. Auto-updates every couple of seconds."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
        right={
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs">
            <StatusDot health="up" pulse /> {rt.activeCount} active now
          </span>
        }
      />

      {isEmpty ? (
        <AnalyticsEmpty icon={<Activity className="h-7 w-7" />} />
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Active sessions" value={rt.activeCount.toLocaleString("en-US")} tone="ok" sub="last 5 min" />
        <StatTile label="Events / hour" value={rt.eventsLastHour.toLocaleString("en-US")} />
        <StatTile label="Orders today" value={rt.ordersToday.toLocaleString("en-US")} tone="primary" />
        <StatTile label="Feed events" value={rt.recent.length.toLocaleString("en-US")} sub="most recent" />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Events per minute · last 30 min</CardTitle>
          <span className="text-[11px] text-muted-foreground">peak {maxMin}/min</span>
        </CardHeader>
        <CardContent>
          <div className="flex h-24 items-end gap-1">
            {rt.perMinute.map((m) => (
              <div
                key={m.minute}
                className="flex-1 rounded-t bg-primary/70 transition-[height] hover:bg-primary"
                style={{ height: `${Math.max(2, (m.count / maxMin) * 100)}%` }}
                title={`${m.minute}m ago · ${m.count} events`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>30m ago</span>
            <span>now</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Active sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {rt.activeSessions.length === 0 ? (
              <Empty icon={<Activity className="h-8 w-8" />} title="No one active right now" hint="Sessions with an event in the last 5 minutes appear here." />
            ) : (
              <div className="flex flex-col divide-y divide-border/60">
                {rt.activeSessions.slice(0, 20).map((s) => (
                  <div key={s.sessionId} className="flex items-center gap-3 py-2">
                    <StatusDot health="up" pulse />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">#{s.shortSession}</span>
                        <span className="truncate text-sm">{s.lastAction}</span>
                        {s.hasOrder && <Badge variant="ok">bought</Badge>}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {s.page} · {s.device} · {s.location}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{ago(s.agoMs)} ago</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live event feed</CardTitle>
          </CardHeader>
          <CardContent>
            {rt.recent.length === 0 ? (
              <Empty icon={<Activity className="h-8 w-8" />} title="No events yet" />
            ) : (
              <div className="flex max-h-[520px] flex-col divide-y divide-border/50 overflow-y-auto">
                {rt.recent.map((e) => {
                  const Icon = KIND_ICON[e.kind];
                  return (
                    <div key={e.id} className="flex items-center gap-3 py-1.5">
                      <Icon className={cn("h-4 w-4 shrink-0", KIND_TONE[e.kind])} />
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-sm">{e.action}</span>
                        <div className="truncate text-[11px] text-muted-foreground">
                          <span className="font-mono">#{e.shortSession}</span> · {e.page} · {e.location}
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{ago(e.agoMs)} ago</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        </>
      )}
    </div>
  );
}
