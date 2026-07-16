/**
 * BEHAVIOR / USER FLOW — how visitors actually move through the site.
 *
 * Five lenses on the Telemetry stream (with the deterministic seed fallback so
 * the page renders before the read endpoint is live):
 *   • Top pages by views (Recharts bar) + a per-page table with average
 *     time-on-page, entry-rate and EXIT-RATE meters.
 *   • Common user JOURNEYS — the most-walked collapsed page sequences, shown as
 *     a step list of page chips.
 *   • A custom PATH FLOW explorer — a Sankey-ish forward branch tree from a
 *     chosen entry page (pure SVG/flex, no external lib).
 *   • A session EVENT TIMELINE explorer — pick a session_id → its ordered events.
 *
 * Matches the analytics area chrome (AnalyticsHeader / StatTile / MeterBar) and
 * the admin dark theme.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Route,
  ArrowRight,
  MousePointerClick,
  Eye,
  ShoppingCart,
  CreditCard,
  Search,
  AlertTriangle,
  Move,
  Clock,
  DoorOpen,
  LogIn,
  Timer,
  Activity,
  ChevronRight,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import {
  buildBehavior,
  buildFlowTree,
  fmtDuration,
  shortPage,
  type FlowNode,
  type FlowEvent,
  type SessionJourney,
} from "@/lib/behaviorFlow";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader, AnalyticsEmpty, StatTile, MeterBar } from "./shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Empty } from "@/components/Empty";
import { cn } from "@/lib/utils";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const AXIS = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };

/* ------------------------------------------------------------------ */
/* Event-type visual vocabulary (timeline + legend).                   */
/* ------------------------------------------------------------------ */

type Tone = "primary" | "warn" | "ok" | "down" | "muted" | "info";

const TONE_CLASS: Record<Tone, { text: string; bg: string; dot: string; ring: string }> = {
  primary: { text: "text-primary", bg: "bg-primary/15", dot: "bg-primary", ring: "border-primary/40" },
  warn: { text: "text-warn", bg: "bg-warn/15", dot: "bg-warn", ring: "border-warn/40" },
  ok: { text: "text-ok", bg: "bg-ok/15", dot: "bg-ok", ring: "border-ok/40" },
  down: { text: "text-down", bg: "bg-down/15", dot: "bg-down", ring: "border-down/40" },
  muted: { text: "text-muted-foreground", bg: "bg-muted", dot: "bg-muted-foreground", ring: "border-border" },
  info: { text: "text-foreground", bg: "bg-accent", dot: "bg-foreground/60", ring: "border-border" },
};

function classifyEvent(e: FlowEvent): { tone: Tone; icon: typeof Eye; label: string } {
  const n = e.name;
  const t = e.type;
  if (t === "order" || /order|purchase|transaction/.test(n)) return { tone: "ok", icon: CreditCard, label: "order" };
  if (/checkout|payment|billing/.test(n) || t === "checkout") return { tone: "ok", icon: CreditCard, label: "checkout" };
  if (/add_?to_?cart|cart/.test(n)) return { tone: "ok", icon: ShoppingCart, label: "cart" };
  if (/ai_?outage|error|fail|timeout/.test(n) || t === "error") return { tone: "down", icon: AlertTriangle, label: "error" };
  if (/search/.test(n) || t === "search") return { tone: "info", icon: Search, label: "search" };
  if (t === "click" || t === "tap" || /click|tap|press|cta/.test(n)) return { tone: "warn", icon: MousePointerClick, label: "click" };
  if (/scroll/.test(n) || t === "scroll") return { tone: "muted", icon: Move, label: "scroll" };
  if (/hover|dwell|mouse/.test(n) || t === "hover") return { tone: "muted", icon: Move, label: "hover" };
  if (t === "view" || /view|visit|screen|page/.test(n)) return { tone: "primary", icon: Eye, label: "view" };
  return { tone: "info", icon: Activity, label: e.type || "event" };
}

/* ================================================================== */

export function BehaviorFlow({ config }: { config: AppConfig }) {
  const { events, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config, { orders: false });
  const b = useMemo(() => buildBehavior(events), [events]);

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<Route className="h-4 w-4 text-primary" />}
        title="Behavior & user flow"
        subtitle="How visitors move through the site — the pages they see, the paths they walk, how long they linger, where they leave, and a replay of any single session's events in order."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {isEmpty ? (
        <AnalyticsEmpty icon={<Route className="h-7 w-7" />} />
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Sessions" value={b.sessions.toLocaleString("en-US")} />
        <StatTile label="Page views" value={b.totalViews.toLocaleString("en-US")} tone="primary" />
        <StatTile label="Avg time / page" value={fmtDuration(b.avgTimeMs)} sub="measured visits" />
        <StatTile label="Pages / session" value={b.avgPagesPerSession.toFixed(1)} />
        <StatTile label="Bounce rate" value={pct(b.bounceRate)} tone={b.bounceRate > 0.5 ? "down" : "warn"} sub="1-page sessions" />
        <StatTile label="Unique pages" value={b.pages.length.toLocaleString("en-US")} />
      </div>

      {b.sessions === 0 ? (
        <Empty
          icon={<Route className="h-8 w-8" />}
          title="No session telemetry yet"
          hint="Flow lights up once sessions emit events carrying a session_id and page_url."
        />
      ) : (
        <>
          <TopPagesSection b={b} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <CommonJourneys b={b} />
            <PathFlowExplorer b={b} />
          </div>
          <SessionExplorer journeys={b.journeys} />
        </>
      )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1 · Top pages by views — bar chart + detail table.                  */
/* ------------------------------------------------------------------ */

function TopPagesSection({ b }: { b: ReturnType<typeof buildBehavior> }) {
  const top = b.pages.slice(0, 10);
  const chartData = top.map((p) => ({
    page: shortPage(p.page, 18),
    full: p.page,
    views: p.views,
    exitRate: p.exitRate,
  }));
  const maxExit = Math.max(...b.pages.map((p) => p.exitRate), 0.0001);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Eye className="h-4 w-4 text-primary" />
          <CardTitle>Top pages by views</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
                <YAxis
                  type="category"
                  dataKey="page"
                  width={124}
                  tick={AXIS}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--accent))" }}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(v: number, _n, item) => [
                    `${v.toLocaleString("en-US")} views · ${pct((item?.payload as { exitRate: number }).exitRate)} exit`,
                    (item?.payload as { full: string }).full,
                  ]}
                />
                <Bar dataKey="views" radius={[0, 4, 4, 0]} maxBarSize={26}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.exitRate > 0.6 ? "hsl(var(--down))" : "hsl(var(--primary))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Bars turn red where a page also has a high exit rate — high traffic that keeps leaking sessions.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Clock className="h-4 w-4 text-warn" />
          <CardTitle>Page engagement · time & exits</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Page</TH>
                <TH className="text-right">Views</TH>
                <TH className="text-right">Sessions</TH>
                <TH className="text-right">Avg time</TH>
                <TH className="text-right">Entry</TH>
                <TH className="w-28">Exit rate</TH>
              </TR>
            </THead>
            <TBody>
              {b.pages.slice(0, 12).map((p) => (
                <TR key={p.page}>
                  <TD className="max-w-[190px] truncate font-medium" title={p.page}>
                    {shortPage(p.page, 26)}
                  </TD>
                  <TD className="text-right tabular-nums">{p.views.toLocaleString("en-US")}</TD>
                  <TD className="text-right tabular-nums text-muted-foreground">{p.sessions.toLocaleString("en-US")}</TD>
                  <TD className="text-right tabular-nums" title={`${p.timedVisits} timed visits`}>
                    {p.timedVisits ? fmtDuration(p.avgTimeMs) : "—"}
                  </TD>
                  <TD className="text-right tabular-nums text-muted-foreground">{pct(p.entryRate)}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <MeterBar value={p.exitRate} max={maxExit} tone={p.exitRate > 0.6 ? "down" : "warn"} />
                      <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums">
                        {pct(p.exitRate)}
                      </span>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2 · Common user journeys — step list of collapsed page sequences.   */
/* ------------------------------------------------------------------ */

function CommonJourneys({ b }: { b: ReturnType<typeof buildBehavior> }) {
  const paths = b.paths.filter((p) => p.steps.length >= 1).slice(0, 8);
  const max = paths[0]?.count ?? 1;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Route className="h-4 w-4 text-primary" /> Common journeys
        </CardTitle>
        <span className="text-[11px] text-muted-foreground">{b.paths.length} distinct paths</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {paths.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No multi-page paths yet.</div>
        ) : (
          paths.map((p) => (
            <div key={p.key} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {p.steps.map((s, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                        i === 0
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : i === p.steps.length - 1
                            ? "border-border bg-muted text-foreground"
                            : "border-border bg-secondary text-muted-foreground",
                      )}
                      title={s}
                    >
                      {shortPage(s, 20)}
                    </span>
                    {i < p.steps.length - 1 && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <MeterBar value={p.count} max={max} tone="primary" className="flex-1" />
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {p.count.toLocaleString("en-US")} · {pct(p.share)}
                </span>
                {p.ordered > 0 && (
                  <Badge variant="ok" className="shrink-0">
                    {p.ordered} bought
                  </Badge>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 3 · Path flow explorer — Sankey-ish forward branch tree.            */
/* ------------------------------------------------------------------ */

function PathFlowExplorer({ b }: { b: ReturnType<typeof buildBehavior> }) {
  const entries = b.entryPages.slice(0, 6);
  const [entry, setEntry] = useState<string>(entries[0]?.page ?? "");

  useEffect(() => {
    if (entries.length && !entries.some((e) => e.page === entry)) setEntry(entries[0].page);
  }, [entries, entry]);

  const tree = useMemo(
    () => (entry ? buildFlowTree(b.journeys, entry, 4, 4) : null),
    [b.journeys, entry],
  );

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2">
          <ChevronRight className="h-4 w-4 text-primary" /> Path flow — where they go next
        </CardTitle>
        <div className="flex flex-wrap gap-1.5">
          {entries.map((e) => (
            <button
              key={e.page}
              onClick={() => setEntry(e.page)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                entry === e.page
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-secondary text-muted-foreground hover:bg-accent",
              )}
              title={`${e.count} sessions entered on ${e.page}`}
            >
              {shortPage(e.page, 16)} · {e.count}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {tree && tree.count > 0 ? (
          <div className="overflow-x-auto">
            <div className="min-w-[420px]">
              <FlowBranch node={tree} rootCount={tree.count} depth={0} isLast />
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No onward steps from this entry — most sessions leave immediately.
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Reading down the tree replays the most-walked next steps from the chosen entry page. Bar width is the
          share of sessions from the entry that reached that step.
        </p>
      </CardContent>
    </Card>
  );
}

function FlowBranch({
  node,
  rootCount,
  depth,
  isLast,
}: {
  node: FlowNode;
  rootCount: number;
  depth: number;
  isLast: boolean;
}) {
  const share = rootCount ? node.count / rootCount : 0;

  return (
    <div className={cn("relative", depth > 0 && "pl-5")}>
      {depth > 0 && (
        <>
          {/* vertical rail */}
          <span
            className={cn("absolute left-0 top-0 w-px bg-border", isLast ? "h-3.5" : "h-full")}
            aria-hidden
          />
          {/* elbow into the node */}
          <span className="absolute left-0 top-3.5 h-px w-4 bg-border" aria-hidden />
        </>
      )}

      <div className="py-0.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
              depth === 0
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-secondary text-foreground",
            )}
            title={node.page}
          >
            {shortPage(node.page, 22)}
          </span>
          <span className="relative h-2 flex-1 overflow-hidden rounded bg-muted">
            <span
              className={cn("absolute inset-y-0 left-0 rounded", depth === 0 ? "bg-primary" : "bg-primary/60")}
              style={{ width: `${Math.max(3, share * 100)}%` }}
            />
          </span>
          <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
            {node.count.toLocaleString("en-US")} · {pct(share)}
          </span>
        </div>
      </div>

      {node.children.length > 0 && (
        <div className="flex flex-col">
          {node.children.map((c, i) => (
            <FlowBranch
              key={c.page + i}
              node={c}
              rootCount={rootCount}
              depth={depth + 1}
              isLast={i === node.children.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4 · Session event timeline explorer.                                */
/* ------------------------------------------------------------------ */

function SessionExplorer({ journeys }: { journeys: SessionJourney[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>(journeys[0]?.session ?? "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? journeys.filter(
          (j) => j.session.toLowerCase().includes(q) || j.entry.toLowerCase().includes(q) || j.exit.toLowerCase().includes(q),
        )
      : journeys;
    return list.slice(0, 60);
  }, [journeys, query]);

  useEffect(() => {
    if (!journeys.some((j) => j.session === selected)) {
      setSelected(filtered[0]?.session ?? journeys[0]?.session ?? "");
    }
  }, [journeys, filtered, selected]);

  const session = journeys.find((j) => j.session === selected) ?? null;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Activity className="h-4 w-4 text-primary" />
        <CardTitle>Session event timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          {/* Session picker */}
          <div className="flex flex-col gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search session id / page…"
              className="h-8 text-xs"
            />
            <div className="max-h-[420px] overflow-y-auto rounded-lg border border-border">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">No sessions match.</div>
              ) : (
                filtered.map((j) => (
                  <button
                    key={j.session}
                    onClick={() => setSelected(j.session)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 border-b border-border/60 px-3 py-2 text-left transition-colors last:border-b-0",
                      selected === j.session ? "bg-primary/10" : "hover:bg-accent/50",
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="truncate font-mono text-[11px] font-medium" title={j.session}>
                        {j.session}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {j.events.length} ev
                      </span>
                    </div>
                    <div className="flex w-full items-center gap-1 text-[10px] text-muted-foreground">
                      <LogIn className="h-3 w-3 shrink-0" />
                      <span className="truncate">{shortPage(j.entry, 12)}</span>
                      <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                      <DoorOpen className="h-3 w-3 shrink-0" />
                      <span className="truncate">{shortPage(j.exit, 12)}</span>
                      {j.ordered && <Badge variant="ok" className="ml-auto shrink-0 px-1 py-0 text-[9px]">buy</Badge>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Timeline */}
          <div>
            {session ? <SessionTimeline session={session} /> : (
              <div className="py-10 text-center text-sm text-muted-foreground">Pick a session to replay its events.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionTimeline({ session }: { session: SessionJourney }) {
  const start = Number.isFinite(session.start) ? session.start : session.events.find((e) => e.hasTime)?.t ?? NaN;

  return (
    <div className="flex flex-col gap-3">
      {/* Session meta strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 p-3">
        <Badge variant="muted" className="font-mono">{session.session}</Badge>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Timer className="h-3 w-3" /> {fmtDuration(session.durationMs)}
        </span>
        <span className="text-[11px] text-muted-foreground">{session.events.length} events</span>
        <span className="text-[11px] text-muted-foreground">{session.uniquePages} pages</span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <LogIn className="h-3 w-3" /> {shortPage(session.entry, 18)}
          <ArrowRight className="h-3 w-3" />
          <DoorOpen className="h-3 w-3" /> {shortPage(session.exit, 18)}
        </span>
        {session.ordered && <Badge variant="ok" className="ml-auto">converted</Badge>}
      </div>

      {/* Ordered events */}
      <ol className="relative flex flex-col">
        {session.events.map((ev, i) => {
          const { tone, icon: Icon, label } = classifyEvent(ev);
          const tc = TONE_CLASS[tone];
          const prev = i > 0 ? session.events[i - 1] : null;
          const delta = prev && prev.hasTime && ev.hasTime ? ev.t - prev.t : NaN;
          const offset = Number.isFinite(start) && ev.hasTime ? ev.t - start : NaN;
          const time = ev.hasTime ? new Date(ev.t).toLocaleTimeString("en-US", { hour12: false }) : "—";
          const detail = ev.elementText || ev.elementId || ev.productId || "";
          const isLast = i === session.events.length - 1;

          return (
            <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
              {/* rail */}
              {!isLast && <span className="absolute left-[13px] top-7 h-[calc(100%-1rem)] w-px bg-border" aria-hidden />}
              {/* node */}
              <span
                className={cn(
                  "relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                  tc.bg,
                  tc.ring,
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", tc.text)} />
              </span>
              {/* content */}
              <div className="min-w-0 flex-1 rounded-lg border border-border/60 bg-card px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium">{ev.rawName}</span>
                  <Badge variant="muted" className={cn("px-1.5 py-0 text-[10px]", tc.text)}>
                    {label}
                  </Badge>
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground" title={time}>
                    {time}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span className="truncate" title={ev.page}>{shortPage(ev.page, 30)}</span>
                  {detail && (
                    <>
                      <span className="text-border">·</span>
                      <span className="truncate" title={detail}>“{detail}”</span>
                    </>
                  )}
                  {ev.productId && (
                    <Badge variant="muted" className="px-1 py-0 text-[9px]">{ev.productId}</Badge>
                  )}
                  <span className="ml-auto tabular-nums">
                    {Number.isFinite(offset) ? `+${fmtDuration(offset)}` : ""}
                    {Number.isFinite(delta) && delta > 0 ? `  Δ${fmtDuration(delta)}` : ""}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
