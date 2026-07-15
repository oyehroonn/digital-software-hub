/**
 * HealthBoard — live operational status for every DSM backend.
 *
 * Self-contained: runs its own 30s poll loop (independent of App's header
 * check) and keeps a rolling per-service history so it can show latency
 * sparklines, session uptime and average/peak latency — not just a dot.
 *
 * Probes (per the resilience contract):
 *   STABLE   — Ecommerce Apps Script (schema ping), Email API (mailcli whoami)
 *   UNSTABLE — VPS (dsm-api /ai/status), codex-proxy (/v1/models), Simli
 *   LOCAL    — pending offline edit queue
 *
 * "Reachable" (any HTTP response, even 4xx/5xx) counts as UP for a status
 * board; a network error / timeout = DOWN. Email is UNKNOWN outside Tauri
 * (the native shell is required to run mailcli) and is excluded from uptime.
 *
 * Also surfaces the recent `ai_outage` telemetry feed (fired by the site
 * whenever an unstable backend degrades) so the board doubles as an
 * incident log for the AI features.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { httpGet, mailcli, runtime } from "@/lib/rpc";
import { fetchTelemetry } from "@/lib/ecommerce";
import { extractOutages, outagesByService, type OutageEvent } from "@/lib/analytics";
import {
  getQueue,
  pushQueue,
  removeItem,
  subscribe,
  type QueueItem,
} from "@/lib/offlineQueue";
import { StatusDot } from "@/components/StatusDot";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { cn, timeAgo } from "@/lib/utils";

const POLL_MS = 30_000;
const HISTORY = 40; // rolling window (~20 min at 30s cadence)
const OUTAGE_LIMIT = 500;

/** Production VPS status endpoint (config default vps_base points at localhost). */
const VPS_STATUS_URL = "https://dsm-api.techrealm.ai/ai/status";

type Kind = "stable" | "unstable" | "local";
type Health = "up" | "down" | "unknown";

interface ProbeDef {
  key: string;
  label: string;
  kind: Kind;
  target: string;
  run: (cfg: AppConfig) => Promise<unknown>;
}

interface Sample {
  t: number;
  ok: boolean | null; // null = skipped/unknown (e.g. email outside Tauri)
  ms: number | null;
  detail: string;
}

function buildProbes(cfg: AppConfig): ProbeDef[] {
  return [
    {
      key: "ecommerce",
      label: "Ecommerce (Apps Script)",
      kind: "stable",
      target: "?action=schema",
      run: (c) => httpGet(`${c.ecommerce_url}?action=schema`, { timeoutMs: 5000 }),
    },
    {
      key: "email",
      label: "Email API",
      kind: "stable",
      target: "mailcli whoami",
      run: (c) => mailcli(c.email_cli, "whoami"),
    },
    {
      key: "vps",
      label: "VPS Flask API",
      kind: "unstable",
      target: VPS_STATUS_URL,
      run: () => httpGet(VPS_STATUS_URL, { timeoutMs: 8000 }),
    },
    {
      key: "codex",
      label: "codex-proxy (LLM)",
      kind: "unstable",
      target: "/v1/models",
      run: (c) =>
        httpGet(`${c.codex_base}/models`, {
          timeoutMs: 2500,
          headers: c.codex_key ? { Authorization: `Bearer ${c.codex_key}` } : undefined,
        }),
    },
    {
      key: "simli",
      label: "Simli (avatar)",
      kind: "unstable",
      target: cfg.simli_base,
      run: (c) => httpGet(c.simli_base, { timeoutMs: 2500 }),
    },
  ];
}

async function probeOnce(p: ProbeDef, cfg: AppConfig): Promise<Sample> {
  // Email needs the native shell; in a plain browser it can't be evaluated.
  if (p.key === "email" && !runtime.isTauri) {
    return { t: Date.now(), ok: null, ms: null, detail: "desktop app only" };
  }
  const start = performance.now();
  try {
    await p.run(cfg);
    return { t: Date.now(), ok: true, ms: Math.round(performance.now() - start), detail: "reachable" };
  } catch (e: unknown) {
    return {
      t: Date.now(),
      ok: false,
      ms: Math.round(performance.now() - start),
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

function healthOf(s?: Sample): Health {
  if (!s || s.ok === null) return "unknown";
  return s.ok ? "up" : "down";
}

interface Derived {
  latest?: Sample;
  health: Health;
  uptimePct: number | null;
  avgMs: number | null;
  maxMs: number | null;
  measured: number;
}

function derive(samples: Sample[]): Derived {
  const latest = samples[samples.length - 1];
  const measured = samples.filter((s) => s.ok !== null);
  const okMs = measured.filter((s) => s.ok && s.ms != null).map((s) => s.ms as number);
  const up = measured.filter((s) => s.ok).length;
  return {
    latest,
    health: healthOf(latest),
    uptimePct: measured.length ? (up / measured.length) * 100 : null,
    avgMs: okMs.length ? Math.round(okMs.reduce((a, b) => a + b, 0) / okMs.length) : null,
    maxMs: okMs.length ? Math.max(...okMs) : null,
    measured: measured.length,
  };
}

/** Hand-rolled latency sparkline: line of response times, red dots on failures. */
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
        p.ok === false ? (
          <circle key={i} cx={i * stepX} cy={y(p.ms)} r={2.2} fill="hsl(4 65% 54%)" />
        ) : null,
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
  if (!anyUp)
    return { tone: "warn", title: "Awaiting first results…", sub: "Running health probes." };
  return { tone: "ok", title: "All systems operational", sub: "Every reachable backend is responding." };
}

export function HealthBoard({ config }: { config: AppConfig }) {
  const probes = useMemo(() => buildProbes(config), [config]);

  const [history, setHistory] = useState<Record<string, Sample[]>>({});
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
      setHistory((prev) => {
        const next: Record<string, Sample[]> = { ...prev };
        probes.forEach((p, i) => {
          const arr = (next[p.key] ?? []).concat(samples[i]);
          next[p.key] = arr.slice(-HISTORY);
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

  // Poll loop — pauses while the window/tab is hidden, resumes on focus.
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

  // 1s ticker drives the "next check in Ns" countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => subscribe(setQueue), []);

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

  const upCount = derived.filter(({ d }) => d.health === "up").length;
  const downCount = derived.filter(({ d }) => d.health === "down").length;
  const countdown = Math.max(0, Math.ceil((nextAt - now) / 1000));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Health board</h1>
          <p className="text-xs text-muted-foreground">
            Live status, latency & incident feed for every backend. Polls every 30s.
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

      {/* Overall status banner */}
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
            <div>
              <div className="text-lg font-semibold tabular-nums text-ok">{upCount}</div>
              <div className="text-[10px] uppercase text-muted-foreground">up</div>
            </div>
            <div>
              <div
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  downCount > 0 ? "text-down" : "text-muted-foreground",
                )}
              >
                {downCount}
              </div>
              <div className="text-[10px] uppercase text-muted-foreground">down</div>
            </div>
            <div>
              <div
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  queue.length > 0 ? "text-warn" : "text-muted-foreground",
                )}
              >
                {queue.length}
              </div>
              <div className="text-[10px] uppercase text-muted-foreground">queued</div>
            </div>
            <div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {lastCheck ? timeAgo(lastCheck) : "—"}
              </div>
              <div className="text-[10px] uppercase text-muted-foreground">last check</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-service detail cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {derived.map(({ probe, d }) => (
          <Card key={probe.key}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    <StatusDot health={d.health} pulse={probe.kind === "unstable"} />
                    <span className="truncate">{probe.label}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Badge variant={probe.kind === "stable" ? "muted" : probe.kind === "local" ? "muted" : "default"}>
                      {probe.kind}
                    </Badge>
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

              <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-center">
                <Stat
                  label="uptime"
                  value={d.uptimePct == null ? "—" : `${d.uptimePct.toFixed(0)}%`}
                  tone={d.uptimePct != null && d.uptimePct < 100 ? (d.uptimePct < 90 ? "down" : "warn") : "muted"}
                />
                <Stat label="avg" value={d.avgMs == null ? "—" : `${d.avgMs}ms`} />
                <Stat label="peak" value={d.maxMs == null ? "—" : `${d.maxMs}ms`} />
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
        ))}
      </div>

      {/* AI outage feed */}
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
              <div className="py-6 text-center text-sm text-muted-foreground">
                No AI outages recorded.
              </div>
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
              <Activity className="h-4 w-4" /> Recent ai_outage feed
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
                        <TD className="whitespace-nowrap text-muted-foreground">
                          {timeAgo(o.timestamp ?? "")}
                        </TD>
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

      {/* Pending offline edit queue */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Pending edit queue ({queue.length})</CardTitle>
          <Button size="sm" onClick={push} disabled={pushing || queue.length === 0}>
            <UploadCloud className={pushing ? "animate-pulse" : ""} /> Push now
          </Button>
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
                    <Badge
                      variant={
                        it.status === "failed" ? "down" : it.status === "pushing" ? "warn" : "muted"
                      }
                    >
                      {it.status}
                    </Badge>
                    <button
                      onClick={() => removeItem(it.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Discard"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
