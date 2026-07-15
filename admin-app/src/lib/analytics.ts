/**
 * Derives the sales funnel and the ai_outage feed from raw telemetry events.
 * Event names are matched loosely so minor naming drift on the site doesn't
 * silently zero out a funnel stage.
 */
import type { TelemetryEvent, Order } from "./ecommerce";

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  rate: number; // fraction of the first stage
}

export interface OutageEvent {
  timestamp?: string;
  service: string;
  feature: string;
  error: string;
  sessionId?: string;
}

const STAGE_MATCHERS: { key: string; label: string; test: (e: string) => boolean }[] = [
  { key: "view", label: "Page views", test: (e) => /page_?view|visit|session_?start/.test(e) },
  { key: "product", label: "Product views", test: (e) => /product_?view|view_?product|pdp/.test(e) },
  { key: "cart", label: "Add to cart", test: (e) => /add_?to_?cart|cart_?add/.test(e) },
  { key: "checkout", label: "Checkout", test: (e) => /checkout|begin_?checkout/.test(e) },
  { key: "order", label: "Orders", test: (e) => /^order$|purchase|order_?placed|order_?created/.test(e) },
];

export function buildFunnel(events: TelemetryEvent[]): FunnelStage[] {
  const counts = STAGE_MATCHERS.map(() => 0);
  for (const ev of events) {
    const name = String(ev.event ?? ev.eventType ?? "").toLowerCase();
    if (!name) continue;
    STAGE_MATCHERS.forEach((m, i) => {
      if (m.test(name)) counts[i]++;
    });
  }
  const base = counts[0] || 1;
  return STAGE_MATCHERS.map((m, i) => ({
    key: m.key,
    label: m.label,
    count: counts[i],
    rate: counts[i] / base,
  }));
}

export function extractOutages(events: TelemetryEvent[]): OutageEvent[] {
  return events
    .filter((e) => String(e.event ?? "").toLowerCase() === "ai_outage")
    .map((e) => {
      const meta = (typeof e.metadata === "object" && e.metadata ? e.metadata : {}) as Record<
        string,
        unknown
      >;
      return {
        timestamp: e.timestamp,
        service: String(meta.service ?? "unknown"),
        feature: String(meta.feature ?? "unknown"),
        error: String(meta.error ?? ""),
        sessionId: e.sessionId,
      };
    })
    .sort((a, b) => Date.parse(b.timestamp ?? "") - Date.parse(a.timestamp ?? ""));
}

/* -------------------------------------------------------------------------- *
 * Conversion funnel (view → click → addToCart → checkout → order)
 *
 * Counts DISTINCT SESSIONS that reached each stage, not raw events — a session
 * that clicks ten times is one "click", so drop-off between stages is a real
 * per-visitor conversion rate rather than an activity tally. Stage membership
 * is independent (a session is "in" a stage if it fired ≥1 matching event), so
 * a missing intermediate event never zeroes a downstream stage.
 * -------------------------------------------------------------------------- */

export interface FunnelStageDef {
  key: string;
  label: string;
  test: (eventName: string) => boolean;
}

/** Ordered funnel stages. Matchers are loose so site-side naming drift is tolerated. */
export const FUNNEL_STAGE_DEFS: FunnelStageDef[] = [
  {
    key: "view",
    label: "View",
    test: (e) => /page_?view|product_?view|view_?product|pdp|screen_?view|impression|visit|session_?start/.test(e),
  },
  {
    key: "click",
    label: "Click",
    test: (e) => /(^|_)click|tap|press|select_?item|product_?click|cta|hotspot/.test(e),
  },
  {
    key: "addToCart",
    label: "Add to cart",
    test: (e) => /add_?to_?cart|cart_?add|addtocart|added_?to_?bag/.test(e),
  },
  {
    key: "checkout",
    label: "Checkout",
    test: (e) => /checkout|begin_?checkout|initiate_?checkout|payment|billing/.test(e),
  },
  {
    key: "order",
    label: "Order",
    test: (e) => /^order$|purchase|order_?placed|order_?created|order_?complete|transaction|receipt/.test(e),
  },
];

export interface SessionFunnelStage {
  key: string;
  label: string;
  count: number; // distinct sessions reaching this stage
  rate: number; // count / stage[0].count  (overall conversion to here, 0..1)
  widthPct: number; // count / max(stage counts) * 100  (bar scaling, never > 100)
  stepRate: number; // count / previous stage count (step conversion; 1 for first)
  dropOffPct: number; // fraction lost vs previous stage, clamped ≥ 0 (0 for first)
  lost: number; // sessions lost vs previous stage, clamped ≥ 0 (0 for first)
}

function eventName(e: TelemetryEvent): string {
  return String(e.event ?? e.eventType ?? "").toLowerCase();
}

function sessionKey(e: TelemetryEvent, i: number): string {
  const k = e.sessionId ?? e.anonymousId;
  // Events with no session id can't be de-duplicated → treat each as its own
  // visitor so they still register (raw fallback) rather than vanishing.
  return k != null && String(k) !== "" ? String(k) : `__ev${i}`;
}

/**
 * Build the 5-stage session funnel. Pass `productId` to scope every stage to
 * events carrying that product (the per-product funnel).
 */
export function buildSessionFunnel(
  events: TelemetryEvent[],
  productId?: string | number,
): SessionFunnelStage[] {
  const sets = FUNNEL_STAGE_DEFS.map(() => new Set<string>());
  const pid = productId != null ? String(productId) : null;

  events.forEach((e, i) => {
    if (pid != null && String(e.productId ?? "") !== pid) return;
    const name = eventName(e);
    if (!name) return;
    const sk = sessionKey(e, i);
    FUNNEL_STAGE_DEFS.forEach((d, idx) => {
      if (d.test(name)) sets[idx].add(sk);
    });
  });

  const counts = sets.map((s) => s.size);
  const base = counts[0] || 0;
  const maxc = Math.max(...counts, 1);

  return FUNNEL_STAGE_DEFS.map((d, i) => {
    const prev = i === 0 ? counts[i] : counts[i - 1];
    const stepRate = i === 0 ? 1 : prev ? counts[i] / prev : 0;
    return {
      key: d.key,
      label: d.label,
      count: counts[i],
      rate: base ? counts[i] / base : 0,
      widthPct: (counts[i] / maxc) * 100,
      stepRate,
      dropOffPct: i === 0 ? 0 : Math.max(0, 1 - stepRate),
      lost: i === 0 ? 0 : Math.max(0, prev - counts[i]),
    };
  });
}

export interface ProductFunnel {
  productId: string;
  name: string;
  stages: SessionFunnelStage[];
  conversion: number; // order sessions / view sessions (0..1)
  sessions: number; // distinct sessions that touched this product
}

/** Derive display name for a product from telemetry metadata / element text. */
function deriveName(e: TelemetryEvent): string | undefined {
  const meta = (typeof e.metadata === "object" && e.metadata ? e.metadata : {}) as Record<
    string,
    unknown
  >;
  const nm = meta.productName ?? meta.name ?? meta.title ?? e.elementText;
  const s = nm != null ? String(nm).trim() : "";
  return s || undefined;
}

/** One funnel per product referenced in telemetry, ranked by views then reach. */
export function buildProductFunnels(events: TelemetryEvent[]): ProductFunnel[] {
  const byId = new Map<string, TelemetryEvent[]>();
  const names = new Map<string, string>();

  for (const e of events) {
    const raw = e.productId;
    if (raw == null || String(raw).trim() === "") continue;
    const pid = String(raw);
    let bucket = byId.get(pid);
    if (!bucket) byId.set(pid, (bucket = []));
    bucket.push(e);
    if (!names.has(pid)) {
      const nm = deriveName(e);
      if (nm) names.set(pid, nm);
    }
  }

  const out: ProductFunnel[] = [];
  for (const [pid, evs] of byId) {
    const stages = buildSessionFunnel(evs, pid);
    const views = stages[0].count;
    const orders = stages[stages.length - 1].count;
    const sessions = new Set(evs.map((e, i) => sessionKey(e, i))).size;
    out.push({
      productId: pid,
      name: names.get(pid) ?? pid,
      stages,
      conversion: views ? orders / views : 0,
      sessions,
    });
  }

  return out.sort(
    (a, b) => b.stages[0].count - a.stages[0].count || b.sessions - a.sessions,
  );
}

/** Index of the stage with the largest per-visitor drop-off (skips stage 0). */
export function biggestDropStage(stages: SessionFunnelStage[]): number {
  let idx = -1;
  let worst = -1;
  for (let i = 1; i < stages.length; i++) {
    if (stages[i].dropOffPct > worst) {
      worst = stages[i].dropOffPct;
      idx = i;
    }
  }
  return idx;
}

export interface OutageBucket {
  service: string;
  count: number;
}

export function outagesByService(outages: OutageEvent[]): OutageBucket[] {
  const map = new Map<string, number>();
  for (const o of outages) map.set(o.service, (map.get(o.service) ?? 0) + 1);
  return [...map.entries()]
    .map(([service, count]) => ({ service, count }))
    .sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------------ *
 * Per-product analytics
 *
 * Joins the Telemetry sheet (views / clicks, keyed by productId) with the
 * Orders sheet (conversions + revenue) to produce one row per product plus a
 * daily-views sparkline series. All matching is defensive: naming drift on the
 * site never throws, it just under-counts a stage rather than breaking the UI.
 * ------------------------------------------------------------------ */

const PRODUCT_VIEW_RE = /product_?view|view_?product|pdp|product_?detail|view_?item/;
const CLICK_RE = /click|tap|add_?to_?cart|cart_?add|select_?item/;

export interface ProductStat {
  productId: string;
  name: string;
  views: number;
  clicks: number;
  ctr: number; // clicks / views (0 when no views)
  conversions: number; // orders for this product
  revenue: number;
  currency: string;
  spark: number[]; // daily views over the whole telemetry window
}

export interface DayPoint {
  day: string; // YYYY-MM-DD
  count: number;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function dayKey(ts?: string): string {
  const t = Date.parse(ts ?? "");
  if (Number.isNaN(t)) return "";
  return new Date(t).toISOString().slice(0, 10);
}

/** Total events per calendar day, ascending — for the time-series line. */
export function eventsPerDay(events: TelemetryEvent[]): DayPoint[] {
  const map = new Map<string, number>();
  for (const e of events) {
    const d = dayKey(e.timestamp);
    if (!d) continue;
    map.set(d, (map.get(d) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function buildProductAnalytics(
  events: TelemetryEvent[],
  orders: Order[] = [],
): ProductStat[] {
  // Best-known display name per productId (orders are the most reliable source).
  const names = new Map<string, string>();
  for (const o of orders) {
    const pid = String(o.productId ?? "").trim();
    if (pid && o.productName) names.set(pid, String(o.productName));
  }

  interface Acc {
    views: number;
    clicks: number;
    days: Map<string, number>; // day -> view count
  }
  const perProduct = new Map<string, Acc>();
  const allDays = new Set<string>();

  const ensure = (pid: string): Acc => {
    let a = perProduct.get(pid);
    if (!a) {
      a = { views: 0, clicks: 0, days: new Map() };
      perProduct.set(pid, a);
    }
    return a;
  };

  for (const e of events) {
    const pid = String(e.productId ?? "").trim();
    if (!pid) continue;

    // Learn a name from telemetry if orders didn't supply one.
    if (!names.has(pid)) {
      const meta =
        typeof e.metadata === "object" && e.metadata
          ? (e.metadata as Record<string, unknown>)
          : {};
      const guess = meta.productName ?? meta.name ?? e.elementText;
      if (guess) names.set(pid, String(guess));
    }

    const name = String(e.event ?? e.eventType ?? "").toLowerCase();
    const type = String(e.eventType ?? "").toLowerCase();

    if (PRODUCT_VIEW_RE.test(name)) {
      const a = ensure(pid);
      a.views++;
      const d = dayKey(e.timestamp);
      if (d) {
        a.days.set(d, (a.days.get(d) ?? 0) + 1);
        allDays.add(d);
      }
    } else if (type === "click" || CLICK_RE.test(name)) {
      ensure(pid).clicks++;
    }
  }

  // Conversions + revenue from the Orders sheet.
  interface Conv {
    count: number;
    revenue: number;
    currency: string;
  }
  const conv = new Map<string, Conv>();
  for (const o of orders) {
    const pid = String(o.productId ?? "").trim();
    if (!pid) continue;
    const qty = toNumber(o.quantity) || 1;
    const c = conv.get(pid) ?? { count: 0, revenue: 0, currency: String(o.currency ?? "USD") };
    c.count += 1;
    c.revenue += toNumber(o.price) * qty;
    if (o.currency) c.currency = String(o.currency);
    conv.set(pid, c);
  }

  const dayList = [...allDays].sort();
  const ids = new Set<string>([...perProduct.keys(), ...conv.keys()]);
  const stats: ProductStat[] = [];
  for (const pid of ids) {
    const a = perProduct.get(pid);
    const c = conv.get(pid);
    const views = a?.views ?? 0;
    const clicks = a?.clicks ?? 0;
    stats.push({
      productId: pid,
      name: names.get(pid) ?? pid,
      views,
      clicks,
      ctr: views ? clicks / views : 0,
      conversions: c?.count ?? 0,
      revenue: c?.revenue ?? 0,
      currency: c?.currency ?? "USD",
      spark: dayList.map((d) => a?.days.get(d) ?? 0),
    });
  }
  return stats.sort((x, y) => y.views - x.views);
}
