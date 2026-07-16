/**
 * ProductAnalytics(id) — the product drill-down.
 *
 * Everything about one product, scoped to the GLOBAL date range with vs-previous
 * deltas: headline KPIs (views, sessions, CTR, add-to-cart, orders, units,
 * revenue, view→buy), its session funnel, a revenue-and-views time chart, its
 * buyers (each a drill-link to the customer), the referrers/sources that sent
 * traffic to it (drill-links to the campaign), and its own click heatmap.
 */
import { useMemo } from "react";
import {
  Area,
  Bar as RBar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Eye,
  MousePointerClick,
  ShoppingCart,
  Package,
  DollarSign,
  Users,
  Target,
  Boxes,
  Flame,
  Radio,
  Percent,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import { buildSessionFunnel } from "@/lib/analytics";
import { utmOf } from "@/lib/utm";
import { useDateRange } from "../reports/dateRange";
import { ClickHeatmap } from "../ClickHeatmap";
import { CustomerLink, CampaignLink } from "./DrillLink";
import {
  AXIS,
  Bar,
  Block,
  DC,
  Delta,
  EmptyNote,
  GRID,
  LegendDot,
  StatGrid,
  TOOLTIP_LABEL,
  TOOLTIP_STYLE,
  compact,
  dayKey,
  dayLabel,
  isCart,
  isClick,
  isProductView,
  money,
  nf,
  orderValue,
  pctDelta,
  pctStr,
  productOf,
  scopeToRange,
  sessionOf,
  str,
  toNum,
  type Stat,
} from "./detailKit";

export interface ProductAnalyticsProps {
  productId: string;
  name?: string;
  events: TelemetryEvent[];
  orders: Order[];
  config: AppConfig;
}

interface ProdMetrics {
  views: number;
  viewSessions: number;
  sessions: number;
  clicks: number;
  carts: number;
  orders: number;
  units: number;
  revenue: number;
  ctr: number;
  viewToBuy: number;
  currency: string;
}

function metricsFor(events: TelemetryEvent[], orders: Order[], id: string): ProdMetrics {
  const pe = events.filter((e) => productOf(e) === id);
  const po = orders.filter((o) => str(o.productId) === id);
  const viewSess = new Set<string>();
  const orderSess = new Set<string>();
  const allSess = new Set<string>();
  let views = 0;
  let clicks = 0;
  let carts = 0;
  pe.forEach((e, i) => {
    const sk = sessionOf(e, i);
    allSess.add(sk);
    if (isProductView(e)) {
      views++;
      viewSess.add(sk);
    }
    if (isClick(e)) clicks++;
    if (isCart(e)) carts++;
  });
  let units = 0;
  let revenue = 0;
  let currency = "USD";
  for (const o of po) {
    units += toNum(o.quantity) || 1;
    revenue += orderValue(o);
    if (o.currency) currency = str(o.currency);
    const sk = str((o as Record<string, unknown>).sessionId ?? (o as Record<string, unknown>).session_id ?? "");
    if (sk) orderSess.add(sk);
  }
  return {
    views,
    viewSessions: viewSess.size,
    sessions: allSess.size,
    clicks,
    carts,
    orders: po.length,
    units,
    revenue,
    ctr: views ? clicks / views : 0,
    viewToBuy: viewSess.size ? po.length / viewSess.size : 0,
    currency,
  };
}

interface Buyer {
  email: string;
  name: string;
  orders: number;
  units: number;
  spend: number;
  last: number;
  currency: string;
}

function buildBuyers(orders: Order[], id: string): Buyer[] {
  const m = new Map<string, Buyer>();
  for (const o of orders) {
    if (str(o.productId) !== id) continue;
    const email = str(o.email).toLowerCase() || str(o.customerName).toLowerCase();
    if (!email) continue;
    let b = m.get(email);
    if (!b) {
      b = { email, name: str(o.customerName) || email, orders: 0, units: 0, spend: 0, last: 0, currency: str(o.currency) || "USD" };
      m.set(email, b);
    }
    b.orders += 1;
    b.units += toNum(o.quantity) || 1;
    b.spend += orderValue(o);
    const t = Date.parse(str(o.timestamp));
    if (Number.isFinite(t)) b.last = Math.max(b.last, t);
    if (!b.name && o.customerName) b.name = str(o.customerName);
  }
  return [...m.values()].sort((a, b) => b.spend - a.spend);
}

interface RefRow {
  source: string;
  medium: string;
  campaign: string;
  sessions: number;
}

function buildReferrers(events: TelemetryEvent[], id: string): RefRow[] {
  const seen = new Set<string>();
  const m = new Map<string, RefRow>();
  events.forEach((e, i) => {
    if (productOf(e) !== id) return;
    const sk = sessionOf(e, i);
    if (seen.has(sk)) return;
    seen.add(sk);
    const u = utmOf(e);
    const source = u.source || "(direct)";
    const medium = u.medium || (u.source ? "referral" : "none");
    const key = `${source}|${medium}|${u.campaign}`;
    let r = m.get(key);
    if (!r) {
      r = { source, medium, campaign: u.campaign, sessions: 0 };
      m.set(key, r);
    }
    r.sessions++;
  });
  return [...m.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 8);
}

function buildTimeline(events: TelemetryEvent[], orders: Order[], id: string) {
  const views = new Map<string, number>();
  const rev = new Map<string, number>();
  for (const e of events) {
    if (productOf(e) !== id || !isProductView(e)) continue;
    const d = dayKey(str(e.timestamp));
    if (d) views.set(d, (views.get(d) ?? 0) + 1);
  }
  for (const o of orders) {
    if (str(o.productId) !== id) continue;
    const d = dayKey(str(o.timestamp));
    if (d) rev.set(d, (rev.get(d) ?? 0) + orderValue(o));
  }
  const days = [...new Set([...views.keys(), ...rev.keys()])].sort();
  if (!days.length) return [];
  const out: { day: string; label: string; views: number; revenue: number }[] = [];
  const DAYMS = 86_400_000;
  let cur = Date.parse(`${days[0]}T00:00:00Z`);
  const end = Date.parse(`${days[days.length - 1]}T00:00:00Z`);
  for (let i = 0; cur <= end && i < 400; cur += DAYMS, i++) {
    const day = new Date(cur).toISOString().slice(0, 10);
    out.push({ day, label: dayLabel(day), views: views.get(day) ?? 0, revenue: rev.get(day) ?? 0 });
  }
  return out;
}

export function ProductAnalytics({ productId, name, events, orders, config }: ProductAnalyticsProps) {
  const range = useDateRange();
  const scoped = useMemo(() => scopeToRange(events, orders, range), [events, orders, range]);
  const compare = range.compareEnabled;

  const cur = useMemo(() => metricsFor(scoped.cur.events, scoped.cur.orders, productId), [scoped, productId]);
  const prev = useMemo(() => metricsFor(scoped.prev.events, scoped.prev.orders, productId), [scoped, productId]);
  const funnel = useMemo(() => buildSessionFunnel(scoped.cur.events, productId), [scoped, productId]);
  const buyers = useMemo(() => buildBuyers(scoped.cur.orders, productId), [scoped, productId]);
  const referrers = useMemo(() => buildReferrers(scoped.cur.events, productId), [scoped, productId]);
  const timeline = useMemo(() => buildTimeline(scoped.cur.events, scoped.cur.orders, productId), [scoped, productId]);
  const productEvents = useMemo(() => scoped.cur.events.filter((e) => productOf(e) === productId), [scoped, productId]);

  const displayName =
    name ||
    str(scoped.cur.orders.find((o) => str(o.productId) === productId)?.productName) ||
    productId;

  const stats: Stat[] = [
    { label: "Views", value: nf(cur.views), icon: <Eye className="h-3.5 w-3.5" />, color: DC.views, delta: pctDelta(cur.views, prev.views) },
    { label: "Sessions", value: nf(cur.sessions), icon: <Users className="h-3.5 w-3.5" />, color: DC.sessions, delta: pctDelta(cur.sessions, prev.sessions) },
    { label: "Clicks", value: nf(cur.clicks), icon: <MousePointerClick className="h-3.5 w-3.5" />, color: DC.clicks, delta: pctDelta(cur.clicks, prev.clicks), sub: `${pctStr(cur.ctr * 100)} CTR` },
    { label: "Add to cart", value: nf(cur.carts), icon: <ShoppingCart className="h-3.5 w-3.5" />, color: DC.cart, delta: pctDelta(cur.carts, prev.carts) },
    { label: "Orders", value: nf(cur.orders), icon: <Package className="h-3.5 w-3.5" />, color: DC.orders, delta: pctDelta(cur.orders, prev.orders) },
    { label: "Units", value: nf(cur.units), icon: <Boxes className="h-3.5 w-3.5" />, color: DC.cart, delta: pctDelta(cur.units, prev.units) },
    { label: "Revenue", value: money(cur.revenue, cur.currency), icon: <DollarSign className="h-3.5 w-3.5" />, color: DC.revenue, delta: pctDelta(cur.revenue, prev.revenue) },
    { label: "View → buy", value: pctStr(cur.viewToBuy * 100, 2), icon: <Percent className="h-3.5 w-3.5" />, color: DC.rate, delta: pctDelta(cur.viewToBuy, prev.viewToBuy) },
  ];

  const maxBuyerSpend = Math.max(...buyers.map((b) => b.spend), 1);
  const maxRef = Math.max(...referrers.map((r) => r.sessions), 1);

  return (
    <div className="flex flex-col gap-4">
      <StatGrid stats={stats} compare={compare} cols={4} />

      {/* Funnel */}
      <Block title="Conversion funnel" icon={<Target className="h-4 w-4 text-primary" />} desc="Distinct sessions reaching each stage for this product.">
        {funnel[0]?.count ? (
          <div className="flex flex-col gap-2">
            {funnel.map((s, i) => (
              <div key={s.key} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-xs font-medium text-foreground">{s.label}</div>
                <div className="flex-1">
                  <div className="h-6 overflow-hidden rounded bg-muted">
                    <div
                      className="flex h-full items-center justify-end rounded pr-2 text-[10px] font-semibold tabular-nums text-background"
                      style={{ width: `${Math.max(6, s.widthPct)}%`, background: DC.views }}
                    >
                      {nf(s.count)}
                    </div>
                  </div>
                </div>
                <div className="w-28 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {i === 0 ? `${pctStr(s.rate * 100)} overall` : `${pctStr(s.stepRate * 100)} step`}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyNote>No funnel activity for this product in range.</EmptyNote>
        )}
      </Block>

      {/* Revenue & views over time */}
      <Block
        title="Revenue & views over time"
        icon={<DollarSign className="h-4 w-4 text-warn" />}
        right={
          <div className="flex items-center gap-3">
            <LegendDot color={DC.views} label="Views" />
            <LegendDot color={DC.revenue} label="Revenue" />
          </div>
        }
      >
        {timeline.length ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={timeline} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="pd-views" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={DC.views} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={DC.views} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                <YAxis yAxisId="v" tick={AXIS} tickLine={false} axisLine={false} width={34} tickFormatter={compact} />
                <YAxis yAxisId="r" orientation="right" tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={compact} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL}
                  formatter={(value: number, key: string) => (key === "Revenue" ? [money(value, cur.currency), key] : [nf(value), key])}
                />
                <Area yAxisId="v" type="monotone" dataKey="views" name="Views" stroke={DC.views} strokeWidth={2} fill="url(#pd-views)" />
                <Line yAxisId="r" type="monotone" dataKey="revenue" name="Revenue" stroke={DC.revenue} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyNote>No dated activity to chart.</EmptyNote>
        )}
      </Block>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Buyers */}
        <Block title="Buyers" icon={<Users className="h-4 w-4 text-ok" />} desc="Customers who purchased this product — click to open their profile.">
          {buyers.length ? (
            <div className="flex flex-col gap-2.5">
              {buyers.slice(0, 8).map((b) => (
                <div key={b.email} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <CustomerLink email={b.email} name={b.name} chevron className="max-w-full text-sm" />
                    <div className="mt-1">
                      <Bar value={b.spend} max={maxBuyerSpend} color={DC.orders} />
                    </div>
                  </div>
                  <div className="w-20 shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums text-foreground">{money(b.spend, b.currency)}</div>
                    <div className="text-[10px] text-muted-foreground">{nf(b.units)} units</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyNote>No buyers in range.</EmptyNote>
          )}
        </Block>

        {/* Referrers */}
        <Block title="Referrers & sources" icon={<Radio className="h-4 w-4 text-primary" />} desc="Where sessions that viewed this product came from — click to open the campaign.">
          {referrers.length ? (
            <div className="flex flex-col gap-2.5">
              {referrers.map((r) => (
                <div key={`${r.source}-${r.medium}-${r.campaign}`} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <CampaignLink
                      source={r.source}
                      medium={r.medium}
                      campaign={r.campaign}
                      label={`${r.source} / ${r.medium}${r.campaign ? ` · ${r.campaign}` : ""}`}
                      chevron
                      className="max-w-full text-sm"
                    />
                    <div className="mt-1">
                      <Bar value={r.sessions} max={maxRef} color={DC.sessions} />
                    </div>
                  </div>
                  <div className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">{nf(r.sessions)}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyNote>No referrer data in range.</EmptyNote>
          )}
        </Block>
      </div>

      {/* Click heatmap */}
      <Block title="Click heatmap" icon={<Flame className="h-4 w-4 text-down" />} desc="Where visitors click on this product's page.">
        <ClickHeatmap events={productEvents} />
      </Block>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>Product</span>
        <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{productId}</code>
        <span>· {displayName}</span>
        {compare && <span>· vs previous period shown as Δ</span>}
      </div>
    </div>
  );
}
