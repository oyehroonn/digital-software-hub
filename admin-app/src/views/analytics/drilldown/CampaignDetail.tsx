/**
 * CampaignAnalytics(utm) — the campaign / traffic-source drill-down.
 *
 * Full performance for one attribution target (source / medium / campaign),
 * scoped to the GLOBAL date range with vs-previous deltas: sessions, clicks,
 * conversions, conversion-rate, revenue and AOV; a sessions-&-revenue time
 * chart; the landing pages it drove (drill-links to the page); the products it
 * sold (drill-links to the product); and the customers it converted (drill-links
 * to the customer). First-touch attribution, matched from UTM query params /
 * event metadata — identical model to the UTM & campaigns report.
 */
import { useMemo } from "react";
import {
  Area,
  Bar as RBar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Users,
  MousePointerClick,
  ShoppingCart,
  DollarSign,
  Percent,
  Receipt,
  FileText,
  Package,
  Megaphone,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import { utmOf } from "@/lib/utm";
import { useDateRange } from "../reports/dateRange";
import { PageLink, ProductLink, CustomerLink } from "./DrillLink";
import {
  AXIS,
  Bar,
  Block,
  DC,
  EmptyNote,
  GRID,
  LegendDot,
  StatGrid,
  TOOLTIP_LABEL,
  TOOLTIP_STYLE,
  compact,
  dayKey,
  dayLabel,
  isClick,
  isOrderEvent,
  metaOf,
  metaPick,
  money,
  nf,
  pagePath,
  pctDelta,
  pctStr,
  productOf,
  scopeToRange,
  sessionOf,
  str,
  timeOf,
  toNum,
  type Stat,
} from "./detailKit";

export interface CampaignAnalyticsProps {
  source?: string;
  medium?: string;
  campaign?: string;
  label?: string;
  events: TelemetryEvent[];
  orders: Order[];
  config: AppConfig;
}

interface Metrics {
  sessions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  convRate: number;
  aov: number;
  currency: string;
  daily: { label: string; sessions: number; revenue: number }[];
  landing: { path: string; sessions: number }[];
  products: { id: string; name: string; units: number; revenue: number }[];
  customers: { email: string; name: string; revenue: number }[];
}

interface Sess {
  source: string;
  medium: string;
  campaign: string;
  t: number;
  landing: string;
  clicks: number;
  converted: boolean;
  revenue: number;
  email: string;
  name: string;
}

function normSource(s: string): string {
  return (s || "").toLowerCase().trim() || "(direct)";
}

function build(events: TelemetryEvent[], want: { source?: string; medium?: string; campaign?: string }): Metrics {
  // First-touch attribution per session (earliest event carrying a source).
  const sessions = new Map<string, Sess>();
  events.forEach((e, i) => {
    const sk = sessionOf(e, i);
    const t = timeOf(e);
    let s = sessions.get(sk);
    if (!s) {
      const u = utmOf(e);
      s = {
        source: u.source,
        medium: u.medium,
        campaign: u.campaign,
        t: Number.isFinite(t) ? t : Infinity,
        landing: pagePath(e),
        clicks: 0,
        converted: false,
        revenue: 0,
        email: "",
        name: "",
      };
      sessions.set(sk, s);
    } else if (Number.isFinite(t) && t < s.t) {
      const u = utmOf(e);
      if (u.source || !s.source) {
        s.source = u.source;
        s.medium = u.medium;
        s.campaign = u.campaign;
      }
      s.t = t;
      s.landing = pagePath(e);
    }
    if (isClick(e)) s.clicks++;
    if (!s.email) {
      const em = str(metaPick(metaOf(e), "email", "customer_email", "customerEmail")).toLowerCase().trim();
      if (em) s.email = em;
    }
    if (isOrderEvent(e)) {
      s.converted = true;
      const m = metaOf(e);
      const price = toNum(metaPick(m, "price", "value", "total", "amount"));
      const qty = toNum(metaPick(m, "quantity", "qty")) || 1;
      s.revenue += price * qty;
      const nm = str(metaPick(m, "customerName", "name"));
      if (nm && !s.name) s.name = nm;
    }
  });

  const wantSource = want.source ? normSource(want.source) : undefined;
  const matchOf = (s: Sess) => {
    const src = normSource(s.source);
    const med = (s.medium || (s.source ? "referral" : "none")).toLowerCase();
    if (want.campaign) {
      if (s.campaign !== want.campaign) return false;
      if (wantSource && src !== wantSource) return false;
      if (want.medium && med !== want.medium.toLowerCase()) return false;
      return true;
    }
    if (wantSource && src !== wantSource) return false;
    if (want.medium && med !== want.medium.toLowerCase()) return false;
    return true;
  };

  const daily = new Map<string, { sessions: number; revenue: number }>();
  const landing = new Map<string, number>();
  let totalSessions = 0;
  let clicks = 0;
  let conversions = 0;
  let revenue = 0;
  const matchedSk = new Set<string>();
  const emails = new Map<string, { email: string; name: string; revenue: number }>();

  for (const [sk, s] of sessions) {
    if (!matchOf(s)) continue;
    matchedSk.add(sk);
    totalSessions++;
    clicks += s.clicks;
    if (s.converted) {
      conversions++;
      revenue += s.revenue;
    }
    const dk = dayKey(Number.isFinite(s.t) ? s.t : NaN);
    if (dk) {
      const d = daily.get(dk) ?? { sessions: 0, revenue: 0 };
      d.sessions++;
      d.revenue += s.converted ? s.revenue : 0;
      daily.set(dk, d);
    }
    if (s.landing) landing.set(s.landing, (landing.get(s.landing) ?? 0) + 1);
    if (s.converted && s.email) {
      const e = emails.get(s.email) ?? { email: s.email, name: s.name, revenue: 0 };
      e.revenue += s.revenue;
      if (!e.name && s.name) e.name = s.name;
      emails.set(s.email, e);
    }
  }

  // Products sold within matched sessions (from order events).
  const prod = new Map<string, { id: string; name: string; units: number; revenue: number }>();
  events.forEach((e, i) => {
    if (!isOrderEvent(e)) return;
    if (!matchedSk.has(sessionOf(e, i))) return;
    const id = productOf(e);
    if (!id) return;
    const m = metaOf(e);
    const nm = str(metaPick(m, "productName", "name")) || id;
    const price = toNum(metaPick(m, "price", "value")) || 0;
    const qty = toNum(metaPick(m, "quantity", "qty")) || 1;
    const p = prod.get(id) ?? { id, name: nm, units: 0, revenue: 0 };
    p.units += qty;
    p.revenue += price * qty;
    if (!p.name && nm) p.name = nm;
    prod.set(id, p);
  });

  const days = [...daily.keys()].sort();
  const series: { label: string; sessions: number; revenue: number }[] = [];
  if (days.length) {
    const DAYMS = 86_400_000;
    let cur = Date.parse(`${days[0]}T00:00:00Z`);
    const end = Date.parse(`${days[days.length - 1]}T00:00:00Z`);
    for (let i = 0; cur <= end && i < 400; cur += DAYMS, i++) {
      const day = new Date(cur).toISOString().slice(0, 10);
      const d = daily.get(day);
      series.push({ label: dayLabel(day), sessions: d?.sessions ?? 0, revenue: d?.revenue ?? 0 });
    }
  }

  return {
    sessions: totalSessions,
    clicks,
    conversions,
    revenue,
    convRate: totalSessions ? conversions / totalSessions : 0,
    aov: conversions ? revenue / conversions : 0,
    currency: "USD",
    daily: series,
    landing: [...landing.entries()].map(([path, sessions]) => ({ path, sessions })).sort((a, b) => b.sessions - a.sessions).slice(0, 8),
    products: [...prod.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    customers: [...emails.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
  };
}

export function CampaignAnalytics({ source, medium, campaign, label, events, orders, config }: CampaignAnalyticsProps) {
  const range = useDateRange();
  const compare = range.compareEnabled;
  const scoped = useMemo(() => scopeToRange(events, orders, range), [events, orders, range]);
  const want = useMemo(() => ({ source, medium, campaign }), [source, medium, campaign]);

  const cur = useMemo(() => build(scoped.cur.events, want), [scoped, want]);
  const prev = useMemo(() => build(scoped.prev.events, want), [scoped, want]);

  const title = label || [source, medium].filter(Boolean).join(" / ") || campaign || "(direct)";

  const stats: Stat[] = [
    { label: "Sessions", value: nf(cur.sessions), icon: <Users className="h-3.5 w-3.5" />, color: DC.sessions, delta: pctDelta(cur.sessions, prev.sessions) },
    { label: "Clicks", value: nf(cur.clicks), icon: <MousePointerClick className="h-3.5 w-3.5" />, color: DC.clicks, delta: pctDelta(cur.clicks, prev.clicks) },
    { label: "Conversions", value: nf(cur.conversions), icon: <ShoppingCart className="h-3.5 w-3.5" />, color: DC.orders, delta: pctDelta(cur.conversions, prev.conversions) },
    { label: "Conv. rate", value: pctStr(cur.convRate * 100, 2), icon: <Percent className="h-3.5 w-3.5" />, color: DC.rate, delta: pctDelta(cur.convRate, prev.convRate) },
    { label: "Revenue", value: money(cur.revenue, cur.currency), icon: <DollarSign className="h-3.5 w-3.5" />, color: DC.revenue, delta: pctDelta(cur.revenue, prev.revenue) },
    { label: "AOV", value: money(cur.aov, cur.currency), icon: <Receipt className="h-3.5 w-3.5" />, color: DC.cart, delta: pctDelta(cur.aov, prev.aov) },
  ];

  const maxLanding = Math.max(...cur.landing.map((l) => l.sessions), 1);
  const maxProd = Math.max(...cur.products.map((p) => p.revenue), 1);
  const maxCust = Math.max(...cur.customers.map((c) => c.revenue), 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/70 px-3 py-2 text-xs">
        <Megaphone className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {campaign && <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">campaign: {campaign}</span>}
        {source && <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">source: {source}</span>}
        {medium && <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">medium: {medium}</span>}
      </div>

      <StatGrid stats={stats} compare={compare} cols={3} />

      <Block
        title="Sessions & revenue over time"
        icon={<Megaphone className="h-4 w-4 text-primary" />}
        right={
          <div className="flex items-center gap-3">
            <LegendDot color={DC.sessions} label="Sessions" />
            <LegendDot color={DC.revenue} label="Revenue" />
          </div>
        }
      >
        {cur.daily.length ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cur.daily} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="cd-rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={DC.revenue} stopOpacity={0.24} />
                    <stop offset="100%" stopColor={DC.revenue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                <YAxis yAxisId="s" tick={AXIS} tickLine={false} axisLine={false} width={34} tickFormatter={compact} />
                <YAxis yAxisId="r" orientation="right" tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={compact} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL}
                  formatter={(value: number, key: string) => (key === "Revenue" ? [money(value, cur.currency), key] : [nf(value), key])}
                />
                <Area yAxisId="r" type="monotone" dataKey="revenue" name="Revenue" stroke={DC.revenue} strokeWidth={1.5} fill="url(#cd-rev)" />
                <RBar yAxisId="s" dataKey="sessions" name="Sessions" fill={DC.sessions} radius={[3, 3, 0, 0]} maxBarSize={22} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyNote>No attributed sessions to chart in range.</EmptyNote>
        )}
      </Block>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Block title="Landing pages" icon={<FileText className="h-4 w-4 text-primary" />} desc="Where this traffic landed — click to open the page.">
          {cur.landing.length ? (
            <div className="flex flex-col gap-2.5">
              {cur.landing.map((l) => (
                <div key={l.path} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <PageLink url={l.path} title={l.path} chevron className="max-w-full font-mono text-xs" />
                    <div className="mt-1">
                      <Bar value={l.sessions} max={maxLanding} color={DC.views} />
                    </div>
                  </div>
                  <div className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">{nf(l.sessions)}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyNote>No landing pages in range.</EmptyNote>
          )}
        </Block>

        <Block title="Products sold" icon={<Package className="h-4 w-4 text-ok" />} desc="Products purchased through this campaign — click to open.">
          {cur.products.length ? (
            <div className="flex flex-col gap-2.5">
              {cur.products.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <ProductLink id={p.id} name={p.name} chevron className="max-w-full text-sm" />
                    <div className="mt-1">
                      <Bar value={p.revenue} max={maxProd} color={DC.orders} />
                    </div>
                  </div>
                  <div className="w-20 shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums text-foreground">{money(p.revenue, cur.currency)}</div>
                    <div className="text-[10px] text-muted-foreground">{nf(p.units)} units</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyNote>No products sold in range.</EmptyNote>
          )}
        </Block>
      </div>

      <Block title="Customers converted" icon={<Users className="h-4 w-4 text-ok" />} desc="Buyers this campaign brought in — click to open their profile.">
        {cur.customers.length ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {cur.customers.map((c) => (
              <div key={c.email} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <CustomerLink email={c.email} name={c.name} chevron className="max-w-full text-sm" />
                  <div className="mt-1">
                    <Bar value={c.revenue} max={maxCust} color={DC.revenue} />
                  </div>
                </div>
                <div className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">{money(c.revenue, cur.currency)}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyNote>No attributed conversions in range.</EmptyNote>
        )}
      </Block>
    </div>
  );
}
