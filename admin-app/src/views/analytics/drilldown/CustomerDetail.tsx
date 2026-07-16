/**
 * CustomerAnalytics(email) — the customer drill-down.
 *
 * A 360° profile from the stable Orders sheet joined to telemetry: lifetime
 * value, order count, AOV and tenure; in-range spend/orders with vs-previous
 * deltas; a renewal/churn risk read; products & licences owned (drill-links to
 * the product); a cumulative-spend time chart; the full order history; and the
 * customer's tracked sessions from telemetry.
 */
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DollarSign,
  ShoppingBag,
  Receipt,
  CalendarClock,
  KeyRound,
  Activity,
  AlertTriangle,
  MapPin,
  Mail,
  Phone,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import { buildCustomers, scoreChurn, type CustomerRecord } from "@/lib/customers";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { timeAgo } from "@/lib/utils";
import { useDateRange } from "../reports/dateRange";
import { ProductLink } from "./DrillLink";
import {
  AXIS,
  Block,
  DC,
  EmptyNote,
  GRID,
  StatGrid,
  TOOLTIP_LABEL,
  TOOLTIP_STYLE,
  compact,
  dayLabel,
  metaOf,
  metaPick,
  money,
  nf,
  orderValue,
  pctDelta,
  scopeToRange,
  sessionOf,
  str,
  timeOf,
  toNum,
  type Stat,
} from "./detailKit";

export interface CustomerAnalyticsProps {
  email: string;
  name?: string;
  events: TelemetryEvent[];
  orders: Order[];
  config: AppConfig;
}

function findRecord(orders: Order[], email: string): CustomerRecord | undefined {
  const key = email.toLowerCase().trim();
  const all = buildCustomers(orders);
  return all.find((c) => c.email === key || c.key === key || c.name.toLowerCase() === key);
}

function emailOf(e: TelemetryEvent): string {
  return str(metaPick(metaOf(e), "email", "customer_email", "customerEmail", "user_email")).toLowerCase().trim();
}

function inRangeSpend(orders: Order[], email: string, inRange: (t: number) => boolean) {
  let spend = 0;
  let count = 0;
  for (const o of orders) {
    if (str(o.email).toLowerCase() !== email) continue;
    if (!inRange(Date.parse(str(o.timestamp)))) continue;
    spend += orderValue(o);
    count++;
  }
  return { spend, count };
}

function cumulativeSpend(rec: CustomerRecord) {
  const rows = [...rec.orders]
    .map((o) => ({ t: Date.parse(str(o.timestamp)), v: orderValue(o) }))
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);
  let acc = 0;
  return rows.map((r) => {
    acc += r.v;
    return { label: dayLabel(new Date(r.t).toISOString().slice(0, 10)), cumulative: acc };
  });
}

const DAY = 86_400_000;

export function CustomerAnalytics({ email, name, events, orders, config }: CustomerAnalyticsProps) {
  const range = useDateRange();
  const key = email.toLowerCase().trim();
  const compare = range.compareEnabled;

  const rec = useMemo(() => findRecord(orders, key), [orders, key]);
  const scoped = useMemo(() => scopeToRange(events, orders, range), [events, orders, range]);

  const curSpend = useMemo(() => inRangeSpend(orders, key, range.inRange), [orders, key, range]);
  const prevSpend = useMemo(
    () => inRangeSpend(orders, key, (t: number) => range.compareEnabled && range.inPrev(t)),
    [orders, key, range],
  );

  const churn = useMemo(() => (rec ? scoreChurn([rec])[0] : undefined), [rec]);
  const cumulative = useMemo(() => (rec ? cumulativeSpend(rec) : []), [rec]);

  const sessions = useMemo(() => {
    const m = new Map<string, { last: number; events: number; pages: Set<string> }>();
    events.forEach((e, i) => {
      if (emailOf(e) !== key) return;
      const sk = sessionOf(e, i);
      let s = m.get(sk);
      if (!s) m.set(sk, (s = { last: 0, events: 0, pages: new Set() }));
      s.events++;
      const t = timeOf(e);
      if (Number.isFinite(t)) s.last = Math.max(s.last, t);
      s.pages.add(String(e.pageUrl ?? ""));
    });
    return [...m.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.last - a.last);
  }, [events, key]);

  if (!rec) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyNote>
          No orders on record for <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{email}</code>.
        </EmptyNote>
      </div>
    );
  }

  const tenureDays = rec.firstOrder && rec.lastOrder ? Math.max(1, Math.round((rec.lastOrder - rec.firstOrder) / DAY)) : 0;
  const riskTone = churn?.riskLevel === "high" ? "down" : churn?.riskLevel === "medium" ? "warn" : "ok";

  const stats: Stat[] = [
    { label: "Lifetime value", value: money(rec.totalSpend, rec.currency), icon: <DollarSign className="h-3.5 w-3.5" />, color: DC.revenue },
    { label: "Orders", value: nf(rec.orderCount), icon: <ShoppingBag className="h-3.5 w-3.5" />, color: DC.orders },
    { label: "Avg order", value: money(rec.avgOrderValue, rec.currency), icon: <Receipt className="h-3.5 w-3.5" />, color: DC.cart },
    { label: "Tenure", value: tenureDays ? `${nf(tenureDays)}d` : "—", icon: <CalendarClock className="h-3.5 w-3.5" />, color: DC.sessions, sub: rec.lastOrder ? `last order ${timeAgo(rec.lastOrder)}` : undefined },
    { label: "Spend in range", value: money(curSpend.spend, rec.currency), icon: <DollarSign className="h-3.5 w-3.5" />, color: DC.revenue, delta: pctDelta(curSpend.spend, prevSpend.spend) },
    { label: "Orders in range", value: nf(curSpend.count), icon: <ShoppingBag className="h-3.5 w-3.5" />, color: DC.orders, delta: pctDelta(curSpend.count, prevSpend.count) },
    { label: "Sessions", value: nf(sessions.length), icon: <Activity className="h-3.5 w-3.5" />, color: DC.clicks },
    { label: "Churn risk", value: churn ? `${churn.riskScore}` : "—", icon: <AlertTriangle className="h-3.5 w-3.5" />, color: DC.rate, sub: churn?.riskLevel },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Identity strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-card/70 px-3 py-2 text-xs">
        <span className="text-sm font-semibold text-foreground">{rec.name || name || email}</span>
        {rec.email && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Mail className="h-3.5 w-3.5" /> {rec.email}
          </span>
        )}
        {rec.phone && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Phone className="h-3.5 w-3.5" /> {rec.phone}
          </span>
        )}
        {rec.location && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {rec.location}
          </span>
        )}
        {churn && <Badge variant={riskTone as "ok" | "warn" | "down"}>{churn.riskLevel} risk · {churn.riskScore}</Badge>}
      </div>

      <StatGrid stats={stats} compare={compare} cols={4} />

      {churn && churn.reasons.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {churn.reasons.map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
              <AlertTriangle className="h-3 w-3 text-warn" /> {r}
            </span>
          ))}
        </div>
      )}

      <Block title="Cumulative spend" icon={<DollarSign className="h-4 w-4 text-warn" />} desc="Lifetime value accumulating across orders.">
        {cumulative.length ? (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulative} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="cu-spend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={DC.revenue} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={DC.revenue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={compact} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} formatter={(v: number) => [money(v, rec.currency), "Cumulative"]} />
                <Area type="monotone" dataKey="cumulative" name="Cumulative" stroke={DC.revenue} strokeWidth={2} fill="url(#cu-spend)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyNote>No dated orders to chart.</EmptyNote>
        )}
      </Block>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Block title="Products & licences" icon={<KeyRound className="h-4 w-4 text-primary" />} desc="What this customer owns — click to open the product.">
          {rec.products.length ? (
            <div className="flex flex-col gap-2">
              {rec.products.map((p) => (
                <div key={p.productId} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5">
                  <ProductLink id={p.productId} name={p.name} chevron className="text-sm" />
                  <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{nf(p.qty)}</span> owned
                    {p.lastPurchased ? <span> · {timeAgo(p.lastPurchased)}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyNote>No products on record.</EmptyNote>
          )}
        </Block>

        <Block title="Sessions" icon={<Activity className="h-4 w-4 text-primary" />} desc="Tracked visits matched to this customer's email.">
          {sessions.length ? (
            <div className="flex flex-col gap-1.5">
              {sessions.slice(0, 8).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 text-xs">
                  <code className="truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title={s.id}>
                    {s.id}
                  </code>
                  <span className="shrink-0 text-muted-foreground">
                    {nf(s.events)} events · {nf(s.pages.size)} pages · {s.last ? timeAgo(s.last) : "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyNote>No telemetry sessions matched by email.</EmptyNote>
          )}
        </Block>
      </div>

      <Block title="Order history" icon={<Receipt className="h-4 w-4 text-primary" />}>
        {rec.orders.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Product</TH>
                <TH className="text-right">Qty</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {[...rec.orders]
                .sort((a, b) => Date.parse(str(b.timestamp)) - Date.parse(str(a.timestamp)))
                .slice(0, 40)
                .map((o, i) => (
                  <TR key={i}>
                    <TD className="whitespace-nowrap text-muted-foreground">{o.timestamp ? timeAgo(str(o.timestamp)) : "—"}</TD>
                    <TD>
                      {str(o.productId) ? (
                        <ProductLink id={str(o.productId)} name={str(o.productName)} />
                      ) : (
                        str(o.productName) || "—"
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">{nf(toNum(o.quantity) || 1)}</TD>
                    <TD className="text-right font-semibold tabular-nums">{money(orderValue(o), str(o.currency) || rec.currency)}</TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        ) : (
          <EmptyNote>No orders.</EmptyNote>
        )}
      </Block>
    </div>
  );
}
