/**
 * detailKit — the shared design system for the click-to-drill-down detail views
 * (ProductAnalytics / PageAnalytics / CustomerAnalytics / CampaignAnalytics).
 *
 * Self-contained on purpose: it depends only on the stable base UI primitives
 * and the global date-range context, so the drill-down area keeps compiling and
 * looking like one system regardless of churn in the neighbouring report kit.
 * One palette, one KPI look, one delta chip, one mini-chart family, one set of
 * number formatters — matched to the existing dark analytics suite.
 */
import { useId, useMemo, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn, fmtMoney } from "@/lib/utils";
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import { evName, evType, metaOf, metaPick, pagePath, productOf, sessionOf, str, timeOf } from "@/lib/telemetryFields";
import type { DateRangeState } from "../reports/dateRange";

/* -------------------------------------------------------------------------- */
/* palette + chart tokens (aligned with AnalyticsOverview / GeoAnalytics)      */
/* -------------------------------------------------------------------------- */
export const DC = {
  views: "hsl(203 89% 60%)",
  sessions: "hsl(258 82% 68%)",
  clicks: "hsl(190 80% 52%)",
  cart: "hsl(168 66% 48%)",
  orders: "hsl(142 62% 45%)",
  revenue: "hsl(38 92% 55%)",
  rate: "hsl(4 72% 58%)",
  scroll: "hsl(280 70% 66%)",
  prev: "hsl(220 6% 52%)",
};
export const CAT = [DC.views, DC.orders, DC.revenue, DC.sessions, DC.clicks, DC.cart, DC.scroll, DC.rate];
export const AXIS = { fill: "#9aa0a6", fontSize: 11 } as const;
export const GRID = "hsl(220 6% 16%)";
export const TOOLTIP_STYLE = {
  background: "hsl(220 8% 7%)",
  border: "1px solid hsl(220 6% 16%)",
  borderRadius: 8,
  fontSize: 12,
} as const;
export const TOOLTIP_LABEL = { color: "#e8e8e8", marginBottom: 2 } as const;
export const DAY = 86_400_000;

/* -------------------------------------------------------------------------- */
/* formatters                                                                  */
/* -------------------------------------------------------------------------- */
export const nf = (n: number) => Math.round(n || 0).toLocaleString("en-US");
export const compact = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : String(Math.round(v || 0));
export const pctStr = (v: number, d = 1) => `${(v || 0).toFixed(d)}%`;
export const money = (v: number, currency = "USD") => fmtMoney(v || 0, currency);

export function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
export function orderValue(o: Order): number {
  return toNum(o.price) * (toNum(o.quantity) || 1);
}
export function pctDelta(cur: number, prev: number): number | null {
  if (!Number.isFinite(prev) || prev === 0) return cur > 0 ? null : 0;
  return (cur - prev) / prev;
}

/* -------------------------------------------------------------------------- */
/* date helpers                                                                */
/* -------------------------------------------------------------------------- */
export function dayKey(ts?: string | number): string {
  const t = typeof ts === "number" ? ts : Date.parse(ts ?? "");
  if (Number.isNaN(t)) return "";
  return new Date(t).toISOString().slice(0, 10);
}
export function dayLabel(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t)) return day;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Split events + orders into the current and previous comparison windows. */
export function scopeToRange(
  events: TelemetryEvent[],
  orders: Order[],
  range: DateRangeState,
): { cur: { events: TelemetryEvent[]; orders: Order[] }; prev: { events: TelemetryEvent[]; orders: Order[] } } {
  const evCur: TelemetryEvent[] = [];
  const evPrev: TelemetryEvent[] = [];
  const orCur: Order[] = [];
  const orPrev: Order[] = [];
  for (const e of events) {
    const t = timeOf(e);
    if (range.inRange(t)) evCur.push(e);
    else if (range.compareEnabled && range.inPrev(t)) evPrev.push(e);
  }
  for (const o of orders) {
    const t = Date.parse(str(o.timestamp));
    if (range.inRange(t)) orCur.push(o);
    else if (range.compareEnabled && range.inPrev(t)) orPrev.push(o);
  }
  return { cur: { events: evCur, orders: orCur }, prev: { events: evPrev, orders: orPrev } };
}

/* -------------------------------------------------------------------------- */
/* event predicates (shared)                                                   */
/* -------------------------------------------------------------------------- */
const PAGE_VIEW_RE = /page_?view|screen_?view|visit|session_?start|impression/;
const PRODUCT_VIEW_RE = /product_?view|view_?product|pdp|product_?detail|view_?item/;
const CLICK_RE = /(^|_)click|tap|press|select_?item|cta|hotspot/;
const CART_RE = /add_?to_?cart|cart_?add|addtocart|added_?to_?bag/;
const ORDER_RE = /^order$|purchase|order_?placed|order_?created|order_?complete|transaction|receipt/;

export const isPageView = (e: TelemetryEvent) => PAGE_VIEW_RE.test(evName(e));
export const isProductView = (e: TelemetryEvent) => PRODUCT_VIEW_RE.test(evName(e));
export const isCart = (e: TelemetryEvent) => CART_RE.test(evName(e));
export const isOrderEvent = (e: TelemetryEvent) => ORDER_RE.test(evName(e));
export function isClick(e: TelemetryEvent): boolean {
  if (evType(e) === "click" || evType(e) === "tap") return true;
  return CLICK_RE.test(evName(e)) || CART_RE.test(evName(e));
}
export { evName, evType, metaOf, metaPick, pagePath, productOf, sessionOf, str, timeOf };

/* -------------------------------------------------------------------------- */
/* delta chip                                                                  */
/* -------------------------------------------------------------------------- */
export function Delta({
  value,
  invert = false,
  className,
}: {
  value: number | null;
  invert?: boolean;
  className?: string;
}) {
  if (value == null) return <span className={cn("text-[11px] font-medium text-muted-foreground", className)}>new</span>;
  const flat = Math.abs(value) < 0.0005;
  const up = value > 0;
  const good = flat ? undefined : invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const tone = good === undefined ? "text-muted-foreground" : good ? "text-ok" : "text-down";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums", tone, className)}>
      <Icon className="h-3 w-3" />
      {Math.abs(value * 100).toFixed(Math.abs(value) < 0.1 && !flat ? 1 : 0)}%
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* sparkline                                                                   */
/* -------------------------------------------------------------------------- */
export function Spark({ data, color, height = 30 }: { data: number[]; color: string; height?: number }) {
  const id = useId().replace(/[:]/g, "");
  const w = 120;
  const h = height;
  if (data.length < 2 || data.every((v) => v === 0)) return <div style={{ height }} className="w-full" aria-hidden />;
  const max = Math.max(...data);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const px = (i: number) => (i / (data.length - 1)) * w;
  const py = (v: number) => h - 3 - ((v - min) / range) * (h - 6);
  const line = data.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={`dk-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#dk-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w} cy={py(data[data.length - 1])} r={2} fill={color} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* stat tile                                                                   */
/* -------------------------------------------------------------------------- */
export interface Stat {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  color?: string;
  delta?: number | null;
  invert?: boolean;
  sub?: ReactNode;
}

export function StatTile({ s, compare }: { s: Stat; compare?: boolean }) {
  const color = s.color ?? DC.views;
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-3">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-70" style={{ background: color }} aria-hidden />
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {s.icon && <span style={{ color }}>{s.icon}</span>}
          {s.label}
        </span>
        {compare && s.delta !== undefined && <Delta value={s.delta ?? null} invert={s.invert} />}
      </div>
      <div className="mt-1 text-xl font-semibold leading-none tabular-nums text-foreground">{s.value}</div>
      {s.sub != null && <div className="mt-1 truncate text-[10px] text-muted-foreground/80">{s.sub}</div>}
    </div>
  );
}

export function StatGrid({ stats, compare, cols = 4 }: { stats: Stat[]; compare?: boolean; cols?: 3 | 4 | 5 }) {
  const grid = cols === 5 ? "xl:grid-cols-5" : cols === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4";
  return (
    <div className={cn("grid grid-cols-2 gap-2.5 md:grid-cols-3", grid)}>
      {stats.map((s) => (
        <StatTile key={s.label} s={s} compare={compare} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* magnitude bar + section block                                               */
/* -------------------------------------------------------------------------- */
export function Bar({ value, max, color = DC.views, className }: { value: number; max: number; color?: string; className?: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded bg-muted", className)}>
      <span className="block h-full rounded" style={{ width: `${w}%`, background: color }} />
    </span>
  );
}

export function Block({
  title,
  desc,
  icon,
  right,
  children,
  className,
}: {
  title: ReactNode;
  desc?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 p-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
            {icon}
            {title}
          </div>
          {desc && <p className="text-[11px] text-muted-foreground">{desc}</p>}
        </div>
        {right}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {dashed ? (
        <span className="inline-block h-0 w-3 border-t-2 border-dashed" style={{ borderColor: color }} />
      ) : (
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      )}
      {label}
    </span>
  );
}

/** Build a continuous ascending day axis with counts, for detail time-charts. */
export function useDailyAxis<T>(
  rows: T[],
  getTs: (r: T) => number,
  value: (r: T) => number = () => 1,
): { day: string; label: string; value: number }[] {
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const d = dayKey(getTs(r));
      if (!d) continue;
      m.set(d, (m.get(d) ?? 0) + value(r));
    }
    const days = [...m.keys()].sort();
    if (!days.length) return [];
    const out: { day: string; label: string; value: number }[] = [];
    let cur = Date.parse(`${days[0]}T00:00:00Z`);
    const end = Date.parse(`${days[days.length - 1]}T00:00:00Z`);
    for (let i = 0; cur <= end && i < 400; cur += DAY, i++) {
      const day = new Date(cur).toISOString().slice(0, 10);
      out.push({ day, label: dayLabel(day), value: m.get(day) ?? 0 });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{children}</div>;
}
