/**
 * Customer analytics derived from the STABLE Orders sheet (one row per line
 * item), grouped by email. Everything here is PURE and deterministic so the
 * report pages render identical numbers for the live sheet and for the seed.
 *
 * Provides Shopify-parity customer lenses:
 *  - overview   : new vs returning, returning rate, one-time vs repeat, AOV,
 *                 avg orders / customer, predicted LTV — all windowed + compare
 *  - time series: customers over time (new vs returning) and returning-rate line
 *  - location   : customers by country / city
 *  - cohorts    : acquisition-month × months-since retention grid
 *  - rfm        : Recency / Frequency / Monetary quintiles → named segments
 *
 * Every function takes a plain `Win = { start, end }` (epoch ms). The report
 * pages pass the GLOBAL `useDateRange()` window for the current period and the
 * `{ prevStart, prevEnd }` window for the comparison period, so a single toolbar
 * drives the whole suite. "As-of" for recency and cohort observation is the
 * window END.
 */
import type { Order } from "@/lib/ecommerce";
import { buildCustomers, type CustomerRecord } from "@/lib/customers";

const DAY = 86_400_000;

/** A closed time window [start, end] in epoch ms (matches ResolvedRange). */
export interface Win {
  start: number;
  end: number;
}

function inWin(t: number, w: Win): boolean {
  return Number.isFinite(t) && t >= w.start && t <= w.end;
}

/* ------------------------------------------------------------------ *
 * Small parsing helpers (mirror lib/customers so numbers line up)
 * ------------------------------------------------------------------ */

function ts(v: unknown): number {
  const t = Date.parse(String(v ?? ""));
  return Number.isNaN(t) ? 0 : t;
}
function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function orderTime(o: Order): number {
  return ts(o.timestamp);
}
function lineTotal(o: Order): number {
  return num(o.price) * (num(o.quantity) || 1);
}

/** Stable customer key: email, else name|phone (mirrors buildCustomers). */
function keyOf(o: Order): string {
  const email = String(o.email ?? "").trim().toLowerCase();
  if (email) return email;
  const name = String(o.customerName ?? "").trim().toLowerCase();
  const phone = String(o.phone ?? "").trim();
  const k = `${name}|${phone}`;
  return k === "|" ? "" : k;
}

/* month bucket helpers -------------------------------------------------- */

function monthKey(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}
function monthsBetween(aKey: string, bKey: string): number {
  const [ay, am] = aKey.split("-").map(Number);
  const [by, bm] = bKey.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}
function dayKey(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Per-customer first-order index (lifetime, used by every window lens)
 * ------------------------------------------------------------------ */

export interface CustomerIndex {
  /** epoch ms of each customer's FIRST order (lifetime, ignores window). */
  firstOrder: Map<string, number>;
  /** all order timestamps per customer, ascending. */
  timesByKey: Map<string, number[]>;
}

export function buildIndex(orders: Order[]): CustomerIndex {
  const firstOrder = new Map<string, number>();
  const timesByKey = new Map<string, number[]>();
  for (const o of orders) {
    const k = keyOf(o);
    if (!k) continue;
    const t = orderTime(o);
    if (!t) continue;
    const arr = timesByKey.get(k);
    if (arr) arr.push(t);
    else timesByKey.set(k, [t]);
    const f = firstOrder.get(k);
    if (f == null || t < f) firstOrder.set(k, t);
  }
  for (const arr of timesByKey.values()) arr.sort((a, b) => a - b);
  return { firstOrder, timesByKey };
}

/* ------------------------------------------------------------------ *
 * Overview metrics for one window
 * ------------------------------------------------------------------ */

export interface OverviewMetrics {
  customers: number; // distinct customers who ordered in the window
  newCustomers: number; // first-ever order falls in the window
  returningCustomers: number; // ordered in window, but acquired earlier
  returningRate: number; // returning / customers
  orders: number;
  revenue: number;
  aov: number;
  // Lifetime posture as-of the window end (all orders up to `end`):
  activeBase: number; // customers with >=1 order up to end
  oneTime: number; // exactly 1 lifetime order as-of end
  repeat: number; // >=2 lifetime orders as-of end
  repeatRate: number; // repeat / activeBase
  avgOrdersPerCustomer: number; // lifetime orders / activeBase (as-of end)
  predictedLtv: number; // avg predicted LTV across the active base
  totalPredictedLtv: number;
}

/**
 * Predicted lifetime value (deterministic, explainable):
 *   ordersPerYear  = observed cadence (365 / avg inter-purchase interval)
 *   recencyDecay   = exp(-recencyDays / 365)  ~1 fresh → ~0.37 at a year silent
 *   forward12mo    = AOV × ordersPerYear × recencyDecay
 *   predictedLTV   = spentToDate + forward12mo × HORIZON_YEARS
 * A single-order customer is assumed a yearly cadence until proven otherwise.
 */
const LTV_HORIZON_YEARS = 2;
export function predictLtv(spentToDate: number, aov: number, orderTimes: number[], asOf: number): number {
  const n = orderTimes.length;
  if (n === 0) return 0;
  const last = orderTimes[n - 1];
  const first = orderTimes[0];
  const avgInterval = n > 1 ? (last - first) / (n - 1) / DAY : 365;
  const ordersPerYear = Math.min(24, 365 / Math.max(7, avgInterval));
  const recencyDays = Math.max(0, (asOf - last) / DAY);
  const recencyDecay = Math.exp(-recencyDays / 365);
  const forward12 = aov * ordersPerYear * recencyDecay;
  return spentToDate + forward12 * LTV_HORIZON_YEARS;
}

export function overviewMetrics(orders: Order[], idx: CustomerIndex, w: Win): OverviewMetrics {
  const winCustomers = new Set<string>();
  let ordersCt = 0;
  let revenue = 0;
  for (const o of orders) {
    const t = orderTime(o);
    if (!inWin(t, w)) continue;
    const k = keyOf(o);
    if (!k) continue;
    winCustomers.add(k);
    ordersCt += 1;
    revenue += lineTotal(o);
  }
  let newCustomers = 0;
  for (const k of winCustomers) {
    const f = idx.firstOrder.get(k) ?? 0;
    if (f >= w.start && f <= w.end) newCustomers += 1;
  }
  const customers = winCustomers.size;
  const returningCustomers = customers - newCustomers;

  // Lifetime posture + predicted LTV as-of window end.
  const spendByKey = new Map<string, number>();
  const cntByKey = new Map<string, number>();
  for (const o of orders) {
    const t = orderTime(o);
    if (t > w.end) continue;
    const k = keyOf(o);
    if (!k) continue;
    spendByKey.set(k, (spendByKey.get(k) ?? 0) + lineTotal(o));
    cntByKey.set(k, (cntByKey.get(k) ?? 0) + 1);
  }
  let oneTime = 0;
  let repeat = 0;
  let totalLifetimeOrders = 0;
  let totalPredictedLtv = 0;
  for (const [k, times] of idx.timesByKey) {
    const upto = times.filter((t) => t <= w.end);
    if (upto.length === 0) continue;
    totalLifetimeOrders += upto.length;
    if (upto.length === 1) oneTime += 1;
    else repeat += 1;
    const spent = spendByKey.get(k) ?? 0;
    const cnt = cntByKey.get(k) ?? upto.length;
    totalPredictedLtv += predictLtv(spent, cnt ? spent / cnt : 0, upto, w.end);
  }
  const activeBase = oneTime + repeat;

  return {
    customers,
    newCustomers,
    returningCustomers,
    returningRate: customers ? returningCustomers / customers : 0,
    orders: ordersCt,
    revenue,
    aov: ordersCt ? revenue / ordersCt : 0,
    activeBase,
    oneTime,
    repeat,
    repeatRate: activeBase ? repeat / activeBase : 0,
    avgOrdersPerCustomer: activeBase ? totalLifetimeOrders / activeBase : 0,
    predictedLtv: activeBase ? totalPredictedLtv / activeBase : 0,
    totalPredictedLtv,
  };
}

/* ------------------------------------------------------------------ *
 * Customers over time (new vs returning) + returning-rate line
 * ------------------------------------------------------------------ */

export interface TimeBucket {
  key: string;
  label: string;
  newCustomers: number;
  returning: number;
  total: number;
  returningRate: number; // 0..1
}

/**
 * Bucket customers by the period of their FIRST order-in-window. Each customer
 * is counted once (their first visit in the window); "new" if that visit is also
 * their lifetime-first order, else "returning". Monthly buckets for long ranges,
 * daily otherwise (matching the range granularity from the toolbar).
 */
export function customersOverTime(
  orders: Order[],
  idx: CustomerIndex,
  w: Win,
  granularity: "hour" | "day" | "month" = "day",
): TimeBucket[] {
  const monthly = granularity === "month";
  const bucketKey = monthly ? monthKey : dayKey;
  const seen = new Set<string>();
  const buckets = new Map<string, { key: string; new: number; ret: number; order: number }>();
  const rows = orders
    .map((o) => ({ k: keyOf(o), t: orderTime(o) }))
    .filter((r) => r.k && inWin(r.t, w))
    .sort((a, b) => a.t - b.t);
  for (const r of rows) {
    if (seen.has(r.k)) continue;
    seen.add(r.k);
    const bk = bucketKey(r.t);
    let b = buckets.get(bk);
    if (!b) {
      b = { key: bk, new: 0, ret: 0, order: r.t };
      buckets.set(bk, b);
    }
    const f = idx.firstOrder.get(r.k) ?? 0;
    const isNew = f >= w.start && f <= w.end;
    if (isNew) b.new += 1;
    else b.ret += 1;
  }
  return [...buckets.values()]
    .sort((a, b) => a.order - b.order)
    .map((b) => {
      const total = b.new + b.ret;
      return {
        key: b.key,
        label: monthly
          ? monthLabel(b.key)
          : new Date(b.order).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        newCustomers: b.new,
        returning: b.ret,
        total,
        returningRate: total ? b.ret / total : 0,
      };
    });
}

/* ------------------------------------------------------------------ *
 * Customers by location (window scope)
 * ------------------------------------------------------------------ */

export interface LocationRow {
  country: string;
  customers: number;
  orders: number;
  revenue: number;
  topCity: string;
}

export function customersByLocation(orders: Order[], w: Win): LocationRow[] {
  const byCountry = new Map<
    string,
    { customers: Set<string>; orders: number; revenue: number; cities: Map<string, number> }
  >();
  for (const o of orders) {
    if (!inWin(orderTime(o), w)) continue;
    const k = keyOf(o);
    if (!k) continue;
    const country = String(o.country ?? "").trim() || "Unknown";
    const city = String(o.city ?? "").trim();
    let e = byCountry.get(country);
    if (!e) {
      e = { customers: new Set(), orders: 0, revenue: 0, cities: new Map() };
      byCountry.set(country, e);
    }
    e.customers.add(k);
    e.orders += 1;
    e.revenue += lineTotal(o);
    if (city) e.cities.set(city, (e.cities.get(city) ?? 0) + 1);
  }
  return [...byCountry.entries()]
    .map(([country, e]) => {
      let topCity = "—";
      let best = 0;
      for (const [c, n] of e.cities) if (n > best) ((best = n), (topCity = c));
      return { country, customers: e.customers.size, orders: e.orders, revenue: e.revenue, topCity };
    })
    .sort((a, b) => b.customers - a.customers || b.revenue - a.revenue);
}

/** Distribution of customers by lifetime order count as-of `end`. */
export function orderCountDistribution(idx: CustomerIndex, w: Win): { bucket: string; customers: number }[] {
  const counts = [0, 0, 0, 0, 0]; // 1, 2, 3, 4, 5+
  for (const times of idx.timesByKey.values()) {
    const n = times.filter((t) => t <= w.end).length;
    if (n === 0) continue;
    counts[Math.min(n, 5) - 1] += 1;
  }
  return [
    { bucket: "1 order", customers: counts[0] },
    { bucket: "2", customers: counts[1] },
    { bucket: "3", customers: counts[2] },
    { bucket: "4", customers: counts[3] },
    { bucket: "5+", customers: counts[4] },
  ];
}

/* ------------------------------------------------------------------ *
 * Cohort retention grid (acquisition month × months-since)
 * ------------------------------------------------------------------ */

export interface CohortRow {
  monthKey: string;
  label: string;
  size: number;
  /** retained[k] = fraction of the cohort active k months after acquisition. */
  retained: (number | null)[];
}
export interface CohortGrid {
  rows: CohortRow[];
  maxOffset: number; // widest months-since column present
  average: (number | null)[]; // blended retention curve per offset
}

/**
 * Longitudinal retention. Cohort = the calendar month of a customer's FIRST
 * order. Column k = share of that cohort who placed ANY order in the calendar
 * month k months later. Observation is capped at the window END, so cells that
 * couldn't have happened yet stay null (blank), never 0.
 */
export function cohortRetention(orders: Order[], idx: CustomerIndex, w: Win, maxCohorts = 12): CohortGrid {
  const endMonth = monthKey(w.end);
  const activeMonths = new Map<string, Set<string>>();
  for (const o of orders) {
    const t = orderTime(o);
    if (t > w.end) continue;
    const k = keyOf(o);
    if (!k) continue;
    let s = activeMonths.get(k);
    if (!s) ((s = new Set()), activeMonths.set(k, s));
    s.add(monthKey(t));
  }
  const cohorts = new Map<string, string[]>();
  for (const [k, f] of idx.firstOrder) {
    if (f > w.end) continue;
    const cm = monthKey(f);
    const arr = cohorts.get(cm);
    if (arr) arr.push(k);
    else cohorts.set(cm, [k]);
  }
  const cohortKeys = [...cohorts.keys()].sort().slice(-maxCohorts);
  let maxOffset = 0;
  const rows: CohortRow[] = cohortKeys.map((cm) => {
    const members = cohorts.get(cm) ?? [];
    const span = monthsBetween(cm, endMonth);
    maxOffset = Math.max(maxOffset, span);
    const retained: (number | null)[] = [];
    for (let k = 0; k <= span; k++) {
      const targetMonth = addMonths(cm, k);
      let active = 0;
      for (const m of members) if (activeMonths.get(m)?.has(targetMonth)) active += 1;
      retained.push(members.length ? active / members.length : null);
    }
    return { monthKey: cm, label: monthLabel(cm), size: members.length, retained };
  });
  const average: (number | null)[] = [];
  for (let k = 0; k <= maxOffset; k++) {
    let sum = 0;
    let cnt = 0;
    for (const r of rows) {
      const v = r.retained[k];
      if (v != null) ((sum += v), (cnt += 1));
    }
    average.push(cnt ? sum / cnt : null);
  }
  return { rows, maxOffset, average };
}

function addMonths(key: string, k: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * RFM segmentation
 * ------------------------------------------------------------------ */

export type RfmSegment = "Champions" | "Loyal" | "New" | "Promising" | "At risk" | "Churned";

export const RFM_SEGMENTS: RfmSegment[] = ["Champions", "Loyal", "New", "Promising", "At risk", "Churned"];

export interface RfmCustomer {
  key: string;
  name: string;
  email: string;
  location: string;
  recencyDays: number;
  frequency: number; // lifetime orders as-of end
  monetary: number; // lifetime spend as-of end
  r: number; // 1..5 (5 = most recent)
  f: number; // 1..5 (5 = most frequent)
  m: number; // 1..5 (5 = highest value)
  segment: RfmSegment;
}

export interface RfmSummary {
  segment: RfmSegment;
  customers: number;
  share: number;
  revenue: number;
  revenueShare: number;
  avgRecencyDays: number;
  avgFrequency: number;
  avgMonetary: number;
}

export interface RfmResult {
  customers: RfmCustomer[];
  summary: RfmSummary[];
  total: number;
  totalRevenue: number;
}

/** Quintile score (1..5) for a value given a sorted ascending array. */
function quintile(sortedAsc: number[], value: number): number {
  if (sortedAsc.length <= 1) return 3;
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  const frac = lo / sortedAsc.length;
  return Math.min(5, Math.max(1, Math.ceil(frac * 5)));
}

function segmentOf(r: number, f: number, m: number): RfmSegment {
  const fm = Math.max(f, m);
  if (r >= 4 && fm >= 4) return "Champions";
  if (fm >= 4) return "Loyal";
  if (r >= 4 && f <= 2) return "New";
  if (r >= 3) return "Promising";
  if (fm >= 3) return "At risk";
  return "Churned";
}

export function rfmAnalysis(orders: Order[], w: Win): RfmResult {
  const recs = buildCustomers(orders.filter((o) => orderTime(o) <= w.end));
  const active = recs.filter((r) => r.orderCount > 0 && r.lastOrder > 0);
  if (active.length === 0) return { customers: [], summary: [], total: 0, totalRevenue: 0 };
  const asOf = w.end;
  const recArr = active.map((c) => Math.max(0, (asOf - c.lastOrder) / DAY)).sort((a, b) => a - b);
  const freqArr = active.map((c) => c.orderCount).sort((a, b) => a - b);
  const monArr = active.map((c) => c.totalSpend).sort((a, b) => a - b);
  const customers: RfmCustomer[] = active.map((c) => {
    const recencyDays = Math.max(0, (asOf - c.lastOrder) / DAY);
    const r = 6 - quintile(recArr, recencyDays); // fewer days = better
    const f = quintile(freqArr, c.orderCount);
    const m = quintile(monArr, c.totalSpend);
    return {
      key: c.key,
      name: c.name || c.email || c.key,
      email: c.email,
      location: c.location,
      recencyDays: Math.round(recencyDays),
      frequency: c.orderCount,
      monetary: c.totalSpend,
      r,
      f,
      m,
      segment: segmentOf(r, f, m),
    };
  });
  const total = customers.length;
  const totalRevenue = customers.reduce((s, c) => s + c.monetary, 0);
  const summary: RfmSummary[] = RFM_SEGMENTS.map((seg) => {
    const members = customers.filter((c) => c.segment === seg);
    const rev = members.reduce((s, c) => s + c.monetary, 0);
    const n = members.length;
    return {
      segment: seg,
      customers: n,
      share: total ? n / total : 0,
      revenue: rev,
      revenueShare: totalRevenue ? rev / totalRevenue : 0,
      avgRecencyDays: n ? members.reduce((s, c) => s + c.recencyDays, 0) / n : 0,
      avgFrequency: n ? members.reduce((s, c) => s + c.frequency, 0) / n : 0,
      avgMonetary: n ? rev / n : 0,
    };
  }).filter((s) => s.customers > 0);
  return { customers, summary, total, totalRevenue };
}

/** Top customers by predicted LTV (as-of window end). */
export interface LtvCustomer {
  key: string;
  name: string;
  email: string;
  location: string;
  orders: number;
  spent: number;
  predictedLtv: number;
}
export function topByLtv(orders: Order[], w: Win, limit = 10): LtvCustomer[] {
  const recs: CustomerRecord[] = buildCustomers(orders.filter((o) => orderTime(o) <= w.end));
  return recs
    .map((c) => {
      const times = c.orders.map((o) => orderTime(o)).filter(Boolean).sort((a, b) => a - b);
      return {
        key: c.key,
        name: c.name || c.email || c.key,
        email: c.email,
        location: c.location,
        orders: c.orderCount,
        spent: c.totalSpend,
        predictedLtv: predictLtv(c.totalSpend, c.avgOrderValue, times, w.end),
      };
    })
    .sort((a, b) => b.predictedLtv - a.predictedLtv)
    .slice(0, limit);
}

/**
 * Segment colour tokens — aligned to the shared reportKit PALETTE so the whole
 * report suite reads as one system (blue/green/violet/amber/rose + neutral).
 * CVD-validated categorical hues; "Churned" uses the neutral so a dead segment
 * never competes with a live one, and every segment is also direct-labelled.
 */
export const SEGMENT_COLOR: Record<RfmSegment, string> = {
  Champions: "hsl(142 58% 46%)", // ok / green
  Loyal: "hsl(210 80% 58%)", // primary / blue
  New: "hsl(265 62% 64%)", // violet
  Promising: "hsl(24 88% 55%)", // amber
  "At risk": "hsl(4 72% 56%)", // rose
  Churned: "hsl(220 6% 45%)", // muted neutral
};
