/**
 * AI DAILY SALES BRIEFING — "act on these today".
 *
 * Joins the stable Orders sheet with telemetry, computes a deterministic set of
 * sales signals locally (today's revenue, top movers, abandoned carts, biggest
 * funnel leak, at-risk renewals, active AI outages), then asks the LLM to turn
 * those numbers into a short, prioritized action list a salesperson can work.
 *
 * Resilience: the computed signal tiles ALWAYS render (they need no LLM). Only
 * the written action plan depends on the model — if it's down we show the calm
 * AiUnavailable state with a retry, never a crash.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchOrders, type Order } from "@/lib/ecommerce";
import {
  buildFunnel,
  computeKpis,
  extractOutages,
  fetchEvents,
  FUNNEL_MATCHERS,
  type TelemetryEvent,
} from "@/analytics/telemetryClient";
import { buildCustomers, scoreChurn } from "@/lib/customers";
import { chatJson } from "@/lib/llm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiSpinner, AiUnavailable, LevelPill, LlmBadge, Stat, useLlmHealth } from "./aiKit";
import { fmtMoney } from "@/lib/utils";

interface BriefAction {
  title: string;
  why: string;
  priority: "high" | "medium" | "low";
  impact?: string;
}
interface Brief {
  headline: string;
  actions: BriefAction[];
  watch?: string[];
}

const DAY = 86_400_000;

interface Signals {
  ordersToday: number;
  revenueToday: number;
  orders7d: number;
  revenue7d: number;
  currency: string;
  newLeads7d: number;
  abandonedCarts: number;
  biggestLeak: { from: string; to: string; dropPct: number } | null;
  topProducts: { name: string; revenue: number; units: number }[];
  atRiskRenewals: number;
  activeOutages: { service: string; feature: string }[];
  cvr: number;
}

function computeSignals(orders: Order[], events: TelemetryEvent[]): Signals {
  const now = Date.now();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const todayFloor = dayStart.getTime();
  const weekFloor = now - 7 * DAY;

  const num = (v: unknown) => {
    const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const ots = (o: Order) => Date.parse(String(o.timestamp ?? ""));

  let ordersToday = 0;
  let revenueToday = 0;
  let orders7d = 0;
  let revenue7d = 0;
  let currency = "USD";
  const leadEmails = new Set<string>();
  const prodMap = new Map<string, { name: string; revenue: number; units: number }>();

  for (const o of orders) {
    const when = ots(o);
    const qty = num(o.quantity) || 1;
    const line = num(o.price) * qty;
    if (o.currency) currency = String(o.currency);
    if (!Number.isNaN(when) && when >= weekFloor) {
      orders7d += 1;
      revenue7d += line;
      const email = String(o.email ?? "").toLowerCase();
      if (email) leadEmails.add(email);
      if (when >= todayFloor) {
        ordersToday += 1;
        revenueToday += line;
      }
    }
    const pid = String(o.productId ?? o.productName ?? "").trim();
    if (pid) {
      const p = prodMap.get(pid) ?? { name: String(o.productName ?? pid), revenue: 0, units: 0 };
      p.revenue += line;
      p.units += qty;
      prodMap.set(pid, p);
    }
  }

  // Abandoned carts: sessions that added to cart but never ordered.
  const cartSessions = new Set<string>();
  const orderSessions = new Set<string>();
  for (const e of events) {
    const sid = e.sessionId || e.anonymousId;
    if (!sid) continue;
    if (FUNNEL_MATCHERS[2].test(e.event)) cartSessions.add(sid);
    if (FUNNEL_MATCHERS[4].test(e.event)) orderSessions.add(sid);
  }
  let abandonedCarts = 0;
  for (const s of cartSessions) if (!orderSessions.has(s)) abandonedCarts += 1;

  // Biggest funnel leak.
  const funnel = buildFunnel(events);
  let biggestLeak: Signals["biggestLeak"] = null;
  for (let i = 1; i < funnel.length; i++) {
    if (!biggestLeak || funnel[i].dropFromPrev > biggestLeak.dropPct) {
      biggestLeak = { from: funnel[i - 1].label, to: funnel[i].label, dropPct: funnel[i].dropFromPrev };
    }
  }

  const churn = scoreChurn(buildCustomers(orders), now);
  const atRiskRenewals = churn.filter((c) => c.riskLevel === "high").length;

  const outages = extractOutages(events);
  const seen = new Set<string>();
  const activeOutages: { service: string; feature: string }[] = [];
  for (const o of outages) {
    if (seen.has(o.service)) continue;
    seen.add(o.service);
    activeOutages.push({ service: o.service, feature: o.feature });
  }

  const kpis = computeKpis(events);

  return {
    ordersToday,
    revenueToday,
    orders7d,
    revenue7d,
    currency,
    newLeads7d: leadEmails.size,
    abandonedCarts,
    biggestLeak,
    topProducts: [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    atRiskRenewals,
    activeOutages,
    cvr: kpis.cvr,
  };
}

export function DailySalesBriefing({ config }: { config: AppConfig }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [dataErr, setDataErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [brief, setBrief] = useState<Brief | null>(null);
  const [aiState, setAiState] = useState<"idle" | "thinking" | "ready" | "error">("idle");
  const [aiErr, setAiErr] = useState<string | undefined>();

  const { status: llm, recheck } = useLlmHealth(config);

  const loadData = useCallback(async () => {
    setLoading(true);
    setDataErr(null);
    try {
      const [ords, ev] = await Promise.all([
        fetchOrders(config).catch(() => [] as Order[]),
        fetchEvents(config),
      ]);
      setOrders(ords);
      setEvents(ev.events);
      setSeeded(ev.seeded);
    } catch (e) {
      setDataErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const signals = useMemo(() => computeSignals(orders, events), [orders, events]);

  const generate = useCallback(async () => {
    setAiState("thinking");
    setAiErr(undefined);
    const today = new Date().toISOString().slice(0, 10);
    const payload = {
      date: today,
      currency: signals.currency,
      revenue_today: Math.round(signals.revenueToday),
      orders_today: signals.ordersToday,
      revenue_last_7d: Math.round(signals.revenue7d),
      orders_last_7d: signals.orders7d,
      new_leads_last_7d: signals.newLeads7d,
      abandoned_carts: signals.abandonedCarts,
      conversion_rate_pct: +(signals.cvr * 100).toFixed(2),
      biggest_funnel_leak: signals.biggestLeak
        ? `${signals.biggestLeak.from} → ${signals.biggestLeak.to} loses ${(signals.biggestLeak.dropPct * 100).toFixed(0)}%`
        : "n/a",
      top_products: signals.topProducts.map((p) => ({ name: p.name, revenue: Math.round(p.revenue), units: p.units })),
      high_risk_renewals: signals.atRiskRenewals,
      active_ai_outages: signals.activeOutages,
    };
    try {
      const result = await chatJson<Brief>(
        config,
        [
          {
            role: "system",
            content:
              "You are the head of sales at DSM, a B2B software & 3D-tech company. From today's metrics, write a crisp morning briefing a salesperson can act on immediately. Be specific and reference the numbers. Respond ONLY with JSON of shape " +
              '{"headline": string, "actions": [{"title": string, "why": string, "priority": "high"|"medium"|"low", "impact": string}], "watch": string[]}. ' +
              "Give 3-6 actions, most important first. Keep each field to one or two sentences, plain English, no fluff.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
        { temperature: 0.5, maxTokens: 1100 },
      );
      const actions = Array.isArray(result?.actions) ? result.actions : [];
      setBrief({ headline: String(result?.headline ?? "Today's briefing"), actions, watch: result?.watch ?? [] });
      setAiState("ready");
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : String(e));
      setAiState("error");
    }
  }, [config, signals]);

  const money = (v: number) => fmtMoney(v, signals.currency);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">AI Daily Sales Briefing</h1>
            <LlmBadge status={llm} />
          </div>
          <p className="text-xs text-muted-foreground">
            What to act on today — from live orders + telemetry.{" "}
            {seeded && <span className="text-warn">Showing seeded telemetry (read endpoint pending).</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh data
          </Button>
          <Button
            size="sm"
            onClick={generate}
            disabled={aiState === "thinking" || llm === "down"}
            title={llm === "down" ? "AI offline" : "Generate today's action plan"}
          >
            <Sparkles className={aiState === "thinking" ? "animate-pulse" : ""} /> Generate briefing
          </Button>
        </div>
      </div>

      {/* Signal tiles — always available, no LLM required. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Revenue today" value={money(signals.revenueToday)} sub={`${signals.ordersToday} orders`} tone="ok" />
        <Stat label="Revenue 7d" value={money(signals.revenue7d)} sub={`${signals.orders7d} orders`} />
        <Stat label="New leads 7d" value={String(signals.newLeads7d)} tone="primary" />
        <Stat label="Abandoned carts" value={String(signals.abandonedCarts)} sub="no order yet" tone="warn" />
        <Stat label="Conversion" value={`${(signals.cvr * 100).toFixed(1)}%`} sub="sessions → orders" />
        <Stat
          label="Renewals at risk"
          value={String(signals.atRiskRenewals)}
          tone={signals.atRiskRenewals ? "down" : "ok"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* AI action plan */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Act on these today
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">AI-prioritized from the signals above.</p>
            </div>
          </CardHeader>
          <CardContent>
            {aiState === "thinking" ? (
              <div className="py-10">
                <AiSpinner label="Reading today's numbers…" />
              </div>
            ) : aiState === "error" ? (
              <AiUnavailable
                detail={aiErr}
                retrying={llm === "checking"}
                onRetry={async () => {
                  const ok = await recheck();
                  if (ok) void generate();
                }}
              />
            ) : aiState === "ready" && brief ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm font-medium">{brief.headline}</p>
                <ol className="flex flex-col gap-2">
                  {brief.actions.map((a, i) => (
                    <li key={i} className="rounded-lg border border-border/70 bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                            {i + 1}
                          </span>
                          <div>
                            <div className="text-sm font-semibold">{a.title}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">{a.why}</div>
                            {a.impact && (
                              <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-ok">
                                <ArrowRight className="h-3 w-3" /> {a.impact}
                              </div>
                            )}
                          </div>
                        </div>
                        <LevelPill level={a.priority} />
                      </div>
                    </li>
                  ))}
                </ol>
                {brief.watch && brief.watch.length > 0 && (
                  <div className="rounded-lg border border-warn/30 bg-warn/5 p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warn">
                      <AlertTriangle className="h-3.5 w-3.5" /> Keep an eye on
                    </div>
                    <ul className="ml-4 list-disc text-xs text-foreground/80 marker:text-warn">
                      {brief.watch.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <Sparkles className="h-8 w-8 text-primary/60" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  Press <span className="font-medium text-foreground">Generate briefing</span> to turn today&apos;s
                  numbers into a prioritized action list.
                </p>
                {llm === "down" && <p className="text-xs text-down">AI is offline — the data tiles remain live.</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deterministic context the AI reasoned over */}
        <Card>
          <CardHeader>
            <CardTitle>Signals</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" /> Biggest funnel leak
              </div>
              {signals.biggestLeak ? (
                <div className="text-sm">
                  {signals.biggestLeak.from} → {signals.biggestLeak.to}{" "}
                  <Badge variant="down">{(signals.biggestLeak.dropPct * 100).toFixed(0)}% lost</Badge>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">—</div>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <ShoppingCart className="h-3.5 w-3.5" /> Top products (7d+)
              </div>
              {signals.topProducts.length ? (
                <ul className="flex flex-col gap-1">
                  {signals.topProducts.map((p) => (
                    <li key={p.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{p.name}</span>
                      <span className="tabular-nums text-muted-foreground">{money(p.revenue)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted-foreground">No orders yet.</div>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" /> Active AI outages
              </div>
              {signals.activeOutages.length ? (
                <ul className="flex flex-col gap-1">
                  {signals.activeOutages.map((o) => (
                    <li key={o.service} className="text-sm">
                      <Badge variant="warn">{o.service}</Badge>{" "}
                      <span className="text-xs text-muted-foreground">{o.feature}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-ok">All AI features healthy.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {dataErr && (
        <p className="text-xs text-down">
          Couldn&apos;t reach the Orders sheet: {dataErr}. Check the URL/secret in Settings.
        </p>
      )}
    </div>
  );
}
