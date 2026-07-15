/**
 * sessionsData — session-grain derivation shared by the Sessions/Behavior and
 * Conversion reports.
 *
 * Both reports need the SAME notion of a "session": the raw Telemetry stream
 * rolled up per session id into a first-touch channel, a device, a landing page
 * and the funnel stages it reached (cart → checkout → converted). Keeping that
 * roll-up here means the two reports agree on every number, and each can then
 * scope rows to the global date window (by `start`) and compute vs-previous
 * deltas without re-deriving sessions.
 *
 * Everything tolerates the normalized camelCase shape AND the raw snake_case
 * sheet columns, and nothing throws — an empty stream yields an empty array so
 * the reports render their deterministic seed cleanly.
 */
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import {
  evName,
  evType,
  metaOf,
  metaPick,
  num,
  pagePath,
  pick,
  sessionOf,
  str,
  timeOf,
} from "@/lib/telemetryFields";
import { channelOf, type Channel } from "@/lib/acquisition";
import { parseUA, type DeviceType } from "../deviceTech";

export interface SessionRow {
  id: string;
  anon: string;
  /** Session start (earliest event) in epoch ms; 0 when unknown. */
  start: number;
  isNew: boolean;
  device: DeviceType;
  channel: Channel;
  source: string;
  medium: string;
  referrer: string;
  landing: string;
  /** Funnel flags are monotonic downstream (see below). */
  reachedCart: boolean;
  reachedCheckout: boolean;
  converted: boolean;
  /** Best-effort cart value from add-to-cart metadata (0 when absent). */
  cartValue: number;
  /** Realised order revenue for converted sessions. */
  revenue: number;
}

/* -------------------------------------------------------- field extractors -- */

function stageFlags(name: string, type: string) {
  return {
    cart: /add_?to_?cart|cart_?add|added_?to_?bag/.test(name),
    checkout: /checkout|begin_?checkout|payment|billing/.test(name) && !/complete/.test(name),
    order: /^order$|purchase|order_?placed|order_?created|order_?complete|transaction|checkout_?complete/.test(name) ||
      type === "purchase",
  };
}

function eventValue(e: TelemetryEvent): number {
  const m = metaOf(e);
  const price = num(metaPick(m, "price", "value", "total", "amount", "revenue", "subtotal")) ?? 0;
  const qty = num(metaPick(m, "quantity", "qty", "count")) ?? 1;
  return price * qty;
}

function referrerHost(ref: string): { source: string; medium: string } | null {
  if (!ref) return null;
  let host = ref;
  try {
    host = new URL(ref).hostname;
  } catch {
    /* keep raw */
  }
  host = host.replace(/^www\./, "").toLowerCase();
  if (!host) return null;
  if (/google\.|bing\.|duckduckgo\.|yahoo\.|ecosia\.|yandex\./.test(host)) {
    return { source: host.split(".")[0], medium: "organic" };
  }
  if (/facebook\.|fb\.|instagram\.|linkedin\.|lnkd\.|t\.co|twitter\.|x\.com|youtube\.|reddit\.|pinterest\.|tiktok\./.test(host)) {
    return { source: host.replace(/\.com$|\.co$/, "").split(".").pop() || host, medium: "social" };
  }
  return { source: host, medium: "referral" };
}

function firstTouch(e: TelemetryEvent): { source: string; medium: string; referrer: string } {
  const m = metaOf(e);
  const referrer = str(metaPick(m, "referrer", "referer", "ref", "document_referrer"));
  const source = str(metaPick(m, "utm_source", "utmSource", "source", "utm_src"));
  const medium = str(metaPick(m, "utm_medium", "utmMedium", "medium"));
  if (source) return { source: source.toLowerCase(), medium: (medium || "referral").toLowerCase(), referrer };
  const ref = referrerHost(referrer);
  if (ref) return { ...ref, referrer };
  return { source: "(direct)", medium: "none", referrer };
}

/* -------------------------------------------------------------- roll-up -- */

interface Acc {
  id: string;
  anon: string;
  start: number;
  ftT: number;
  device: DeviceType;
  source: string;
  medium: string;
  referrer: string;
  landing: string;
  reachedCart: boolean;
  reachedCheckout: boolean;
  converted: boolean;
  cartValue: number;
  revenue: number;
}

/** Roll the entire telemetry stream into one row per session. */
export function rollupSessions(events: TelemetryEvent[], orders: Order[] = []): SessionRow[] {
  // Revenue per session, joined from the Orders sheet where a session id exists.
  const revBySession = new Map<string, number>();
  for (const o of orders) {
    const sid = str(pick(o as unknown as TelemetryEvent, "sessionId", "session_id", "anonymousId", "anonymous_id"));
    if (!sid) continue;
    const price = num(o.price) ?? 0;
    const qty = num(o.quantity) ?? 1;
    revBySession.set(sid, (revBySession.get(sid) ?? 0) + price * qty);
  }

  const acc = new Map<string, Acc>();
  events.forEach((e, i) => {
    const id = sessionOf(e, i);
    const t = timeOf(e);
    const tt = Number.isFinite(t) ? t : 0;
    const name = evName(e);
    const type = evType(e);
    const f = stageFlags(name, type);
    const dev = parseUA(str(pick(e, "userAgent", "user_agent"))).device;
    const path = pagePath(e);

    let a = acc.get(id);
    if (!a) {
      const ft = firstTouch(e);
      a = {
        id,
        anon: str(pick(e, "anonymousId", "anonymous_id")) || id,
        start: Number.isFinite(t) ? t : Infinity,
        ftT: Number.isFinite(t) ? t : Infinity,
        device: dev,
        source: ft.source,
        medium: ft.medium,
        referrer: ft.referrer,
        landing: path,
        reachedCart: false,
        reachedCheckout: false,
        converted: false,
        cartValue: 0,
        revenue: 0,
      };
      acc.set(id, a);
    }

    if (dev !== "unknown" && a.device === "unknown") a.device = dev;
    if (a.start === Infinity && tt) a.start = tt;

    // Earliest event drives first-touch attribution + landing page.
    if (Number.isFinite(t) && t < a.ftT) {
      a.ftT = t;
      a.start = t;
      if (path !== "(unknown)") a.landing = path;
      const ft = firstTouch(e);
      if (ft.source !== "(direct)" || a.source === "(direct)") {
        a.source = ft.source;
        a.medium = ft.medium;
        a.referrer = ft.referrer || a.referrer;
      }
    }

    if (f.cart) {
      a.reachedCart = true;
      a.cartValue += eventValue(e);
    }
    if (f.checkout) a.reachedCheckout = true;
    if (f.order) {
      a.converted = true;
      a.revenue = Math.max(a.revenue, revBySession.get(id) ?? eventValue(e));
    }
  });

  // New vs returning: earliest session per anon id is "new".
  const firstSeen = new Map<string, number>();
  for (const a of acc.values()) {
    const s = Number.isFinite(a.start) ? a.start : 0;
    const prev = firstSeen.get(a.anon);
    if (prev == null || s < prev) firstSeen.set(a.anon, s);
  }

  return [...acc.values()].map((a) => {
    const start = Number.isFinite(a.start) ? a.start : 0;
    // Downstream stages imply upstream ones so the funnel is monotonic.
    const converted = a.converted;
    const reachedCheckout = a.reachedCheckout || converted;
    const reachedCart = a.reachedCart || reachedCheckout;
    return {
      id: a.id,
      anon: a.anon,
      start,
      isNew: start <= (firstSeen.get(a.anon) ?? start),
      device: a.device,
      channel: channelOf(a.source, a.medium),
      source: a.source,
      medium: a.medium,
      referrer: a.referrer,
      landing: a.landing,
      reachedCart,
      reachedCheckout,
      converted,
      cartValue: a.cartValue,
      revenue: a.revenue,
    };
  });
}

/* ---------------------------------------------------------------- funnel -- */

export interface FunnelCounts {
  sessions: number;
  cart: number;
  checkout: number;
  converted: number;
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Share of the top of funnel (sessions). */
  ofTop: number;
  /** Share retained from the previous stage. */
  ofPrev: number;
  /** Drop from the previous stage (count). */
  dropped: number;
}

export function funnelCounts(rows: SessionRow[]): FunnelCounts {
  let cart = 0;
  let checkout = 0;
  let converted = 0;
  for (const r of rows) {
    if (r.reachedCart) cart++;
    if (r.reachedCheckout) checkout++;
    if (r.converted) converted++;
  }
  return { sessions: rows.length, cart, checkout, converted };
}

export function funnelStages(c: FunnelCounts): FunnelStage[] {
  const top = c.sessions || 1;
  const defs: [string, string, number][] = [
    ["sessions", "Sessions", c.sessions],
    ["cart", "Added to cart", c.cart],
    ["checkout", "Reached checkout", c.checkout],
    ["converted", "Converted", c.converted],
  ];
  return defs.map(([key, label, count], i) => {
    const prev = i === 0 ? count : defs[i - 1][2];
    return {
      key,
      label,
      count,
      ofTop: count / top,
      ofPrev: prev ? count / prev : 0,
      dropped: i === 0 ? 0 : Math.max(0, prev - count),
    };
  });
}

export interface FunnelBreakRow extends FunnelCounts {
  key: string;
  label: string;
  cr: number; // converted / sessions
}

/** Funnel counts split by a categorical accessor (device, channel, …). */
export function funnelBy(
  rows: SessionRow[],
  keyOf: (r: SessionRow) => string,
  labelOf: (k: string) => string = (k) => k,
): FunnelBreakRow[] {
  const map = new Map<string, SessionRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const arr = map.get(k);
    if (arr) arr.push(r);
    else map.set(k, [r]);
  }
  return [...map.entries()]
    .map(([k, arr]) => {
      const c = funnelCounts(arr);
      return { key: k, label: labelOf(k), ...c, cr: c.sessions ? c.converted / c.sessions : 0 };
    })
    .sort((a, b) => b.sessions - a.sessions);
}

export interface AbandonSummary {
  /** Sessions that reached the cart but never converted. */
  carts: number;
  /** Sessions that reached checkout but never converted. */
  checkouts: number;
  /** Estimated recoverable value (cart metadata value, else AOV fallback). */
  value: number;
  /** Average order value used for the fallback. */
  aov: number;
  /** Fraction of carts that never convert. */
  abandonRate: number;
}

export function abandonment(rows: SessionRow[]): AbandonSummary {
  const converted = rows.filter((r) => r.converted);
  const realisedRev = converted.reduce((s, r) => s + (r.revenue || r.cartValue), 0);
  const aov = converted.length ? realisedRev / converted.length : 0;

  let carts = 0;
  let checkouts = 0;
  let value = 0;
  for (const r of rows) {
    if (r.reachedCart && !r.converted) {
      carts++;
      value += r.cartValue > 0 ? r.cartValue : aov;
    }
    if (r.reachedCheckout && !r.converted) checkouts++;
  }
  const cartTotal = rows.filter((r) => r.reachedCart).length;
  return { carts, checkouts, value, aov, abandonRate: cartTotal ? carts / cartTotal : 0 };
}

/* --------------------------------------------------------- time bucketing -- */

export interface BucketPoint {
  label: string;
  ts: number;
  sessions: number;
  converted: number;
  /** Conversion rate for the bucket (converted / sessions). */
  cr: number;
  /** Same-index value from the comparison window (dashed overlay). */
  prevSessions?: number;
  prevCr?: number;
}

/**
 * Tally sessions + conversions into an ordered set of buckets, and (when
 * `prevBuckets` is supplied) fold the previous window's counts into the same
 * points by index so a chart can overlay "vs previous" without a second axis.
 */
export function bucketize(
  rows: SessionRow[],
  buckets: { start: number; end: number; label: string }[],
  prevRows?: SessionRow[],
  prevBuckets?: { start: number; end: number }[],
): BucketPoint[] {
  const count = (rs: SessionRow[], b: { start: number; end: number }) => {
    let s = 0;
    let c = 0;
    for (const r of rs) {
      if (r.start >= b.start && r.start < b.end) {
        s++;
        if (r.converted) c++;
      }
    }
    return { s, c };
  };
  return buckets.map((b, i) => {
    const cur = count(rows, b);
    const point: BucketPoint = {
      label: b.label,
      ts: b.start,
      sessions: cur.s,
      converted: cur.c,
      cr: cur.s ? cur.c / cur.s : 0,
    };
    if (prevRows && prevBuckets && prevBuckets[i]) {
      const pv = count(prevRows, prevBuckets[i]);
      point.prevSessions = pv.s;
      point.prevCr = pv.s ? pv.c / pv.s : 0;
    }
    return point;
  });
}
