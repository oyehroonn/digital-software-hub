/**
 * OpsHealthBoard — the enhanced all-API operational board for the Ops role.
 *
 * Builds on the base HealthBoard with three things the live snapshot lacked:
 *   1. A PERSISTENT incident log (lib/opsHealth) — up→down / down→up transitions
 *      are recorded to localStorage with start, end and duration, so the board
 *      is a real cross-session incident history, not just a live window.
 *   2. Service grouping by resilience tier (STABLE vs UNSTABLE) with a rolled-up
 *      SLA / uptime summary per tier.
 *   3. The site-fired `ai_outage` telemetry feed alongside the infra incidents,
 *      plus the offline edit-queue status.
 *
 * Queue push/discard and incident-log clearing are gated behind the ops
 * permissions (lib/roles) — a read-only viewer sees status but can't mutate.
 *
 * Probes (resilience contract): STABLE ecommerce + email · UNSTABLE VPS + codex
 * + Simli. "Reachable" (any HTTP response) = UP; network error / timeout = DOWN.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  History,
  RefreshCw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchTelemetry } from "@/lib/ecommerce";
import { extractOutages, outagesByService, type OutageEvent } from "@/lib/analytics";
import {
  getQueue,
  pushQueue,
  removeItem,
  subscribe,
  type QueueItem,
} from "@/lib/offlineQueue";
import {
  buildProbes,
  probeOnce,
  derive,
  recordProbe,
  getIncidents,
  subscribeIncidents,
  clearIncidents,
  incidentDurationMs,
  fmtDuration,
  type Sample,
  type Incident,
  type Kind,
  type Health,
} from "@/lib/opsHealth";
import { useCan } from "@/lib/roles";
import { StatusDot } from "@/components/StatusDot";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn, timeAgo } from "@/lib/utils";

const POLL_MS = 30_000;
const HISTORY = 40;
const OUTAGE_LIMIT = 500;

function Sparkline({ samples, health }: { samples: Sample[]; health: Health }) {
  const width = 132;
  const height = 30;
  const pts = samples.filter((s) => s.ms != null) as (Sample & { ms: number })[];
  if (pts.length < 2) {
    return <div className="h-[30px] w-full text-[10px] leading-[30px] text-muted-foreground">collecting…</div>;
  }
  const vals = pts.map((p) => p.ms);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;
  const stepX = pts.length > 1 ? width / (pts.length - 1) : width;
  const y = (v: number) => height - 3 - ((v - min) / range) * (height - 6);
  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${y(p.ms).toFixed(1)}`)
    .join(" ");
  const stroke =
    health === "down" ? "hsl(4 65% 54%)" : health === "up" ? "hsl(142 62% 45%)" : "hsl(220 5% 62%)";
  return (
    <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) =>
        p.ok === false ? <circle key={i} cx={i * stepX} cy={y(p.ms)} r={2.2} fill="hsl(4 65% 54%)" /> : null,
      )}
    </svg>
  );
}

function bannerFor(services: { kind: Kind; health: Health }[]): {
  tone: "ok" | "warn" | "down";
  title: string;
  sub: string;
} {
  const stableDown = services.some((s) => s.kind === "stable" && s.health === "down");
  const unstableDown = services.filter((s) => s.kind === "unstable" && s.health === "down").length;
  const anyUp = services.some((s) => s.health === "up");
  if (stableDown)
    return {
      tone: "down",
      title: "Critical — a stable backend is down",
      sub: "The shop core depends on these. Investigate immediately.",
    };
  if (unstableDown > 0)
    return {
      tone: "warn",
      title: `Degraded — ${unstableDown} unstable backend${unstableDown > 1 ? "s" : ""} down`,
      sub: "AI features degrade silently; the shop core is unaffected.",
    };
  if (!anyUp) return { tone: "warn", title: "Awaiting first results…", sub: "Running health probes." };
  return { tone: "ok", title: "All systems operational", sub: "Every reachable backend is responding." };
}

export function OpsHealthBoard({ config }: { config: AppConfig }) {
  const canQueue = useCan("queue.manage");
  const probes = useMemo(() => buildProbes(config), [config]);

  const [history, setHistory] = useState<Record<string, Sample[]>>({});
  const [incidents, setIncidents] = useState<Incident[]>(getIncidents());
  const [outages, setOutages] = useState<OutageEvent[]>([]);
  const [outageError, setOutageError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const [nextAt, setNextAt] = useState<number>(Date.now() + POLL_MS);
  const [now, setNow] = useState<number>(Date.now());

  const [queue, setQueue] = useState<QueueItem[]>(getQueue());
  const [pushing, setPushing] = useState(false);

  const runningRef = useRef(false);

  const tick = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setChecking(true);
    try {
      const [samples] = await Promise.all([
        Promise.all(probes.map((p) => probeOnce(p, config))),
        fetchTelemetry(config, OUTAGE_LIMIT)
          .then((ev) => {
            setOutages(extractOutages(ev));
            setOutageError(null);
          })
          .catch((e) => setOutageError(e instanceof Error ? e.message : String(e))),
      ]);
      // Persist any state transitions into the durable incident log.
      probes.forEach((p, i) => recordProbe(p, samples[i]));
      setHistory((prev) => {
        const next: Record<string, Sample[]> = { ...prev };
        probes.forEach((p, i) => {
          next[p.key] = (next[p.key] ?? []).concat(samples[i]).slice(-HISTORY);
        });
        return next;
      });
      setLastCheck(Date.now());
    } finally {
      runningRef.current = false;
      setChecking(false);
      setNextAt(Date.now() + POLL_MS);
    }
  }, [config, probes]);

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      tick();
      id = setInterval(tick, POLL_MS);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };
    const onVis = () => {
      if (document.hidden) stop();
      else if (!id) start();
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tick]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => subscribe(setQueue), []);
  useEffect(() => subscribeIncidents(setIncidents), []);

  async function push() {
    setPushing(true);
    try {
      await pushQueue(config);
    } finally {
      setPushing(false);
    }
  }

  const derived = useMemo(
    () => probes.map((p) => ({ probe: p, d: derive(history[p.key] ?? []) })),
    [probes, history],
  );
  const banner = useMemo(
    () => bannerFor(derived.map(({ probe, d }) => ({ kind: probe.kind, health: d.health }))),
    [derived],
  );
  const outageBuckets = useMemo(() => outagesByService(outages), [outages]);

  // Per-tier SLA rollup (mean uptime across measured probes in the tier).
  const tierSla = useMemo(() => {
    const tiers: Kind[] = ["stable", "unstable"];
    return tiers.map((tier) => {
      const rows = derived.filter(({ probe }) => probe.kind === tier);
      const measured = rows.filter(({ d }) => d.uptimePct != null);
      const avg = measured.length
        ? measured.reduce((a, { d }) => a + (d.uptimePct as number), 0) / measured.length
        : null;
      return { tier, avg, total: rows.length, up: rows.filter(({ d }) => d.health === "up").length };
    });
  }, [derived]);

  const upCount = derived.filter(({ d }) => d.health === "up").length;
  const downCount = derived.filter(({ d }) => d.health === "down").length;
  const ongoing = incidents.filter((i) => i.endedAt === null).length;
  const countdown = Math.max(0, Math.ceil((nextAt - now) / 1000));

  const stable = derived.filter(({ probe }) => probe.kind === "stable");
  const unstable = derived.filter(({ probe }) => probe.kind === "unstable");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Ops health board</h1>
          <p className="text-xs text-muted-foreground">
            All-API status, per-tier SLA &amp; a durable incident log. Polls every 30s.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <StatusDot health="up" pulse />
            {checking ? "checking…" : `next check in ${countdown}s`}
          </span>
          <Button variant="outline" size="sm" onClick={tick} disabled={checking}>
            <RefreshCw className={checking ? "animate-spin" : ""} /> Check now
          </Button>
        </div>
      </div>

      {/* Overall banner + counters */}
      <Card
        className={cn(
          "border-l-4",
          banner.tone === "ok" && "border-l-ok",
          banner.tone === "warn" && "border-l-warn",
          banner.tone === "down" && "border-l-down",
        )}
      >
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            {banner.tone === "ok" ? (
              <CheckCircle2 className="h-6 w-6 text-ok" />
            ) : (
              <AlertTriangle className={cn("h-6 w-6", banner.tone === "down" ? "text-down" : "text-warn")} />
            )}
            <div>
              <div className="text-sm font-semibold">{banner.title}</div>
              <div className="text-xs text-muted-foreground">{banner.sub}</div>
            </div>
          </div>
          <div className="flex items-center gap-5 text-center">
            <Counter value={upCount} label="up" tone="ok" />
            <Counter value={downCount} label="down" tone={downCount > 0 ? "down" : "muted"} />
            <Counter value={ongoing} label="ongoing" tone={ongoing > 0 ? "warn" : "muted"} />
            <Counter value={queue.length} label="queued" tone={queue.length > 0 ? "warn" : "muted"} />
            <div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {lastCheck ? timeAgo(lastCheck) : "—"}
              </div>
              <div className="text-[10px] uppercase text-muted-foreground">last check</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-tier SLA rollup */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tierSla.map(({ tier, avg, total, up }) => (
          <Card key={tier}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium capitalize">
                  {tier === "stable" ? "Stable tier" : "Unstable tier"}
                  <Badge variant={tier === "stable" ? "ok" : "warn"}>{tier}</Badge>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {tier === "stable"
                    ? "Shop core — must stay up (ecommerce · email)"
                    : "AI features — degrade silently (VPS · codex · Simli)"}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={cn(
                    "text-2xl font-semibold tabular-nums",
                    avg == null ? "text-muted-foreground" : avg >= 99 ? "text-ok" : avg >= 90 ? "text-warn" : "text-down",
                  )}
                >
                  {avg == null ? "—" : `${avg.toFixed(1)}%`}
                </div>
                <div className="text-[10px] uppercase text-muted-foreground">
                  {up}/{total} up · session SLA
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Service cards, grouped by tier */}
      {[
        { title: "Stable backends", rows: stable },
        { title: "Unstable backends", rows: unstable },
      ].map((grp) => (
        <div key={grp.title}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {grp.title}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {grp.rows.map(({ probe, d }) => {
              const svcIncidents = incidents.filter((i) => i.service === probe.key);
              return (
                <Card key={probe.key}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-medium">
                          <StatusDot health={d.health} pulse={probe.kind === "unstable"} />
                          <span className="truncate">{probe.label}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Badge variant={probe.kind === "stable" ? "muted" : "default"}>{probe.kind}</Badge>
                          <span className="truncate font-mono" title={probe.target}>
                            {probe.target}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div
                          className={cn(
                            "text-sm font-semibold",
                            d.health === "up" && "text-ok",
                            d.health === "down" && "text-down",
                            d.health === "unknown" && "text-muted-foreground",
                          )}
                        >
                          {d.health.toUpperCase()}
                        </div>
                        {d.latest?.ms != null && (
                          <div className="text-[11px] tabular-nums text-muted-foreground">{d.latest.ms}ms</div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3">
                      <Sparkline samples={history[probe.key] ?? []} health={d.health} />
                    </div>

                    <div className="mt-2 grid grid-cols-4 gap-2 border-t border-border/60 pt-2 text-center">
                      <Stat
                        label="uptime"
                        value={d.uptimePct == null ? "—" : `${d.uptimePct.toFixed(0)}%`}
                        tone={d.uptimePct != null && d.uptimePct < 100 ? (d.uptimePct < 90 ? "down" : "warn") : "muted"}
                      />
                      <Stat label="avg" value={d.avgMs == null ? "—" : `${d.avgMs}ms`} />
                      <Stat label="peak" value={d.maxMs == null ? "—" : `${d.maxMs}ms`} />
                      <Stat
                        label="incidents"
                        value={String(svcIncidents.length)}
                        tone={svcIncidents.some((i) => i.endedAt === null) ? "down" : "muted"}
                      />
                    </div>

                    {d.latest && d.latest.detail !== "reachable" && (
                      <div
                        className={cn(
                          "mt-2 truncate text-[11px]",
                          d.health === "down" ? "text-down" : "text-muted-foreground",
                        )}
                        title={d.latest.detail}
                      >
                        {d.latest.detail}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Persistent incident log */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Incident log ({incidents.length})
            {ongoing > 0 && <Badge variant="down">{ongoing} ongoing</Badge>}
          </CardTitle>
          {canQueue && incidents.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearIncidents}>
              <Trash2 /> Clear log
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {incidents.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No incidents recorded — every probe has stayed reachable this session.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Service</TH>
                    <TH>Started</TH>
                    <TH>Duration</TH>
                    <TH>State</TH>
                    <TH>Last error</TH>
                  </TR>
                </THead>
                <TBody>
                  {incidents.map((i) => (
                    <TR key={i.id}>
                      <TD>
                        <span className="flex items-center gap-2">
                          <StatusDot health={i.endedAt === null ? "down" : "up"} />
                          <span className="font-medium">{i.label}</span>
                        </span>
                      </TD>
                      <TD className="whitespace-nowrap text-muted-foreground" title={new Date(i.startedAt).toISOString()}>
                        {timeAgo(i.startedAt)}
                      </TD>
                      <TD className="tabular-nums">{fmtDuration(incidentDurationMs(i))}</TD>
                      <TD>
                        {i.endedAt === null ? (
                          <Badge variant="down">ongoing</Badge>
                        ) : (
                          <Badge variant="ok">resolved</Badge>
                        )}
                      </TD>
                      <TD className="max-w-xs truncate text-muted-foreground" title={i.detail}>
                        {i.detail || "—"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ai_outage telemetry feed */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>ai_outage by service</CardTitle>
          </CardHeader>
          <CardContent>
            {outageError ? (
              <div className="py-6 text-center text-xs text-down" title={outageError}>
                Couldn't read telemetry
              </div>
            ) : outageBuckets.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No AI outages recorded.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {outageBuckets.map((b) => (
                  <div key={b.service} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-3.5 w-3.5 text-warn" />
                      {b.service}
                    </span>
                    <Badge variant="warn">{b.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> Site ai_outage feed
            </CardTitle>
            <span className="text-[11px] text-muted-foreground">{outages.length} total</span>
          </CardHeader>
          <CardContent>
            {outages.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Quiet — every AI feature degraded silently or stayed healthy.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>When</TH>
                      <TH>Service</TH>
                      <TH>Feature</TH>
                      <TH>Error</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {outages.slice(0, 50).map((o, i) => (
                      <TR key={i}>
                        <TD className="whitespace-nowrap text-muted-foreground">{timeAgo(o.timestamp ?? "")}</TD>
                        <TD>
                          <Badge variant="down">{o.service}</Badge>
                        </TD>
                        <TD>{o.feature}</TD>
                        <TD className="max-w-xs truncate text-muted-foreground" title={o.error}>
                          {o.error || "—"}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Offline edit queue */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Offline edit queue ({queue.length})</CardTitle>
          {canQueue ? (
            <Button size="sm" onClick={push} disabled={pushing || queue.length === 0}>
              <UploadCloud className={pushing ? "animate-pulse" : ""} /> Push now
            </Button>
          ) : (
            <Badge variant="muted">read-only</Badge>
          )}
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Queue is empty — all edits are synced.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {queue.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant={it.type === "regen" ? "default" : "muted"}>{it.type}</Badge>
                      <span className="truncate font-medium">
                        {it.productName ?? `#${String(it.productId)}`}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {it.type === "edit" && it.changes
                        ? Object.entries(it.changes)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(", ")
                        : "trigger 3D box regen"}
                      {" · "}
                      {timeAgo(it.createdAt)}
                      {it.lastError ? ` · error: ${it.lastError}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={it.status === "failed" ? "down" : it.status === "pushing" ? "warn" : "muted"}>
                      {it.status}
                    </Badge>
                    {canQueue && (
                      <button
                        onClick={() => removeItem(it.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        title="Discard"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Counter({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "ok" | "warn" | "down" | "muted";
}) {
  return (
    <div>
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "down" && "text-down",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "warn" | "down";
}) {
  return (
    <div>
      <div
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "down" && "text-down",
          tone === "warn" && "text-warn",
          tone === "muted" && "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}
