/**
 * salesData — shared derivation layer for the SALES REPORTS suite.
 *
 * Every Sales* report scopes the Orders sheet to the GLOBAL date-range window
 * (via `useDateRange().inRange` / `inPrev` from ./dateRange) and reduces it along
 * one dimension: time, product, SKU, channel, location, discount, tax, refund
 * status, or referrer. Keeping that math here means every report reports the
 * SAME numbers, with vs-previous deltas.
 *
 * Orders keep their original CSV keys (see lib/ecommerce `normalizeOrder`), so
 * `field()` picks flexibly across snake_case / camelCase aliases — discount /
 * tax / channel / refund columns "light up" automatically if the sheet carries
 * them and degrade to a clean empty state when it does not.
 */
import type { Order } from "@/lib/ecommerce";

const DAY = 86_400_000;

/* --------------------------------- scalars -------------------------------- */

export function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** First non-empty value across a set of column aliases on the raw order bag. */
export function field(o: Order, ...keys: string[]): unknown {
  const bag = o as Record<string, unknown>;
  for (const k of keys) {
    const v = bag[k];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

export function fieldStr(o: Order, ...keys: string[]): string {
  const v = field(o, ...keys);
  return v == null ? "" : String(v).trim();
}

export function fieldNum(o: Order, ...keys: string[]): number {
  return toNum(field(o, ...keys));
}

export function tsOf(o: { timestamp?: string }): number {
  return Date.parse(o.timestamp ?? "");
}

/** Bucket-axis start: the selected window start, or the data's earliest row for all-time. */
export function scopeStart(orders: Order[], start: number): number {
  if (start > 0) return start;
  let min = Infinity;
  for (const o of orders) {
    const t = tsOf(o);
    if (Number.isFinite(t) && t < min) min = t;
  }
  return Number.isFinite(min) ? min : Date.now() - 30 * DAY;
}

/* ------------------------------ order economics --------------------------- */

export function qtyOf(o: Order): number {
  return toNum(o.quantity) || 1;
}

/** Gross line value = unit price × quantity. */
export function grossOf(o: Order): number {
  return toNum(o.price) * qtyOf(o);
}

export function discountOf(o: Order): number {
  return fieldNum(o, "discount", "discount_amount", "discountAmount", "discount_total", "discounts");
}

export function discountCodeOf(o: Order): string {
  const code = fieldStr(o, "discount_code", "discountCode", "coupon", "promo_code", "promoCode", "voucher");
  if (code) return code.toUpperCase();
  const m = /(?:code|coupon|promo)[:\s]+([A-Za-z0-9_-]{3,})/i.exec(String(o.notes ?? ""));
  return m ? m[1].toUpperCase() : "";
}

export function taxOf(o: Order): number {
  return fieldNum(o, "tax", "tax_amount", "taxAmount", "tax_total", "vat", "gst");
}

export function refundOf(o: Order): number {
  return fieldNum(o, "refund", "refund_amount", "refundAmount", "refunded", "refund_total");
}

const REFUND_RE = /refund|return|charge_?back|cancel/i;

export function statusOf(o: Order): string {
  return fieldStr(o, "status", "financial_status", "financialStatus", "fulfillment_status");
}

export function isRefunded(o: Order): boolean {
  if (refundOf(o) > 0) return true;
  return REFUND_RE.test(statusOf(o));
}

/** Refunded magnitude (explicit refund amount, else the whole line). */
export function refundValueOf(o: Order): number {
  const r = refundOf(o);
  return r > 0 ? r : grossOf(o);
}

/** Net line value after per-line discounts and refunds (tax excluded). */
export function netOf(o: Order): number {
  if (isRefunded(o)) return -refundValueOf(o);
  return grossOf(o) - discountOf(o);
}

export function channelOf(o: Order): string {
  return fieldStr(o, "channel", "sales_channel", "salesChannel", "storeName", "store_name") || "Online Store";
}

export function productOf(o: Order): string {
  return fieldStr(o, "productName", "product_name") || fieldStr(o, "productId", "product_id") || "(unknown)";
}

export function skuOf(o: Order): string {
  return fieldStr(o, "sku", "variant_sku", "variantSku") || "(no SKU)";
}

export function countryOf(o: Order): string {
  return fieldStr(o, "country", "country_code") || "";
}

export function cityLabelOf(o: Order): string {
  const city = fieldStr(o, "city");
  const country = countryOf(o);
  if (city && country) return `${city}, ${country}`;
  return city || country || "(unknown)";
}

export function currencyOf(orders: Order[]): string {
  for (const o of orders) if (o.currency) return String(o.currency);
  return "USD";
}

/* ----------------------------- referrer / source -------------------------- */

/**
 * Classify an order's traffic source. Real orders don't carry a referrer, so we
 * read the source the storefront stamps at checkout (metadata / notes
 * "via <source>") and normalise to a channel bucket.
 */
export function referrerOf(o: Order): string {
  const explicit = fieldStr(o, "referrer", "referer", "utm_source", "utmSource", "source");
  const raw = explicit || (/via\s+([a-z0-9_.-]+)/i.exec(String(o.notes ?? ""))?.[1] ?? "");
  return normalizeReferrer(raw);
}

export function normalizeReferrer(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (!s || s === "direct" || s === "(direct)" || s === "none") return "Direct";
  if (/google|bing|duckduckgo|yahoo|search|organic/.test(s)) return "Organic Search";
  if (/facebook|instagram|fb|ig|linkedin|twitter|x\.com|tiktok|social|reddit/.test(s)) return "Social";
  if (/newsletter|email|mail|klaviyo|mailchimp/.test(s)) return "Email";
  if (/cpc|ads|adwords|ppc|paid|gclid|fbclid/.test(s)) return "Paid Ads";
  return s.replace(/^www\./, "").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* --------------------------------- totals --------------------------------- */

export interface SalesTotals {
  gross: number; // Σ price×qty on non-refunded lines
  discounts: number;
  tax: number;
  refunds: number; // positive magnitude of refunded value
  net: number; // gross − discounts − refunds
  orders: number; // non-refunded order lines
  units: number;
  aov: number; // net / orders
  refundedOrders: number;
  discountedOrders: number;
  currency: string;
}

export function summarize(orders: Order[]): SalesTotals {
  let gross = 0;
  let discounts = 0;
  let tax = 0;
  let refunds = 0;
  let units = 0;
  let orderCount = 0;
  let refundedOrders = 0;
  let discountedOrders = 0;
  for (const o of orders) {
    tax += taxOf(o);
    if (isRefunded(o)) {
      refunds += refundValueOf(o);
      refundedOrders += 1;
      continue;
    }
    gross += grossOf(o);
    const disc = discountOf(o);
    discounts += disc;
    if (disc > 0 || discountCodeOf(o)) discountedOrders += 1;
    units += qtyOf(o);
    orderCount += 1;
  }
  const net = gross - discounts - refunds;
  return {
    gross,
    discounts,
    tax,
    refunds,
    net,
    orders: orderCount,
    units,
    aov: orderCount ? net / orderCount : 0,
    refundedOrders,
    discountedOrders,
    currency: currencyOf(orders),
  };
}

/* ------------------------------- time series ------------------------------ */

/** Structural shape of a reportKit `Bucket` (avoids importing the .tsx). */
export interface TimeBucket {
  label: string;
  start: number;
  end: number;
}

export interface SalesPoint {
  label: string;
  gross: number;
  net: number;
  discounts: number;
  tax: number;
  refunds: number;
  orders: number;
  units: number;
  aov: number;
  prevNet: number;
  prevGross: number;
  prevOrders: number;
}

/** Binary-search the bucket whose [start,end) contains `t`; −1 if none. */
function bucketIndex(buckets: TimeBucket[], t: number): number {
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = buckets[mid];
    if (t < b.start) hi = mid - 1;
    else if (t >= b.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/**
 * Tally current-window orders into `buckets`, and (for the compare overlay)
 * previous-window orders shifted forward by `shiftMs` so they land on the same
 * axis. `shiftMs` is the window length (days×DAY); 0 disables the overlay.
 */
export function buildSalesSeries(
  buckets: TimeBucket[],
  current: Order[],
  previous: Order[],
  shiftMs: number,
): SalesPoint[] {
  const pts: SalesPoint[] = buckets.map((b) => ({
    label: b.label,
    gross: 0,
    net: 0,
    discounts: 0,
    tax: 0,
    refunds: 0,
    orders: 0,
    units: 0,
    aov: 0,
    prevNet: 0,
    prevGross: 0,
    prevOrders: 0,
  }));

  for (const o of current) {
    const i = bucketIndex(buckets, tsOf(o));
    if (i < 0) continue;
    const p = pts[i];
    p.tax += taxOf(o);
    if (isRefunded(o)) {
      p.refunds += refundValueOf(o);
      continue;
    }
    p.gross += grossOf(o);
    p.discounts += discountOf(o);
    p.units += qtyOf(o);
    p.orders += 1;
  }

  if (shiftMs > 0) {
    for (const o of previous) {
      const i = bucketIndex(buckets, tsOf(o) + shiftMs);
      if (i < 0) continue;
      const p = pts[i];
      if (isRefunded(o)) {
        p.prevNet -= refundValueOf(o);
        continue;
      }
      p.prevGross += grossOf(o);
      p.prevNet += grossOf(o) - discountOf(o);
      p.prevOrders += 1;
    }
  }

  for (const p of pts) {
    p.net = p.gross - p.discounts - p.refunds;
    p.aov = p.orders ? p.net / p.orders : 0;
  }
  return pts;
}

/* ----------------------------- dimension groups --------------------------- */

export interface DimRow {
  key: string;
  label: string;
  gross: number;
  net: number;
  discounts: number;
  tax: number;
  refunds: number;
  orders: number;
  units: number;
  aov: number;
  prevNet: number;
  delta: number | null;
  share: number; // share of total net (0..1)
}

function pctDelta(cur: number, prev: number): number | null {
  if (!Number.isFinite(prev) || prev === 0) return cur > 0 ? null : 0;
  return (cur - prev) / prev;
}

/**
 * Reduce current-window orders along `keyFn`; when `previous` is provided, join
 * the previous window's net per key so each row carries a vs-previous delta.
 * Rows are sorted by net descending. `filter` optionally drops orders (e.g. keep
 * only discounted / refunded lines).
 */
export function groupDimension(
  current: Order[],
  previous: Order[] | null,
  keyFn: (o: Order) => string,
  labelFn: (o: Order) => string = keyFn,
  filter?: (o: Order) => boolean,
): DimRow[] {
  const rows = new Map<string, DimRow>();
  const ensure = (o: Order): DimRow => {
    const k = keyFn(o);
    let r = rows.get(k);
    if (!r) {
      r = {
        key: k,
        label: labelFn(o),
        gross: 0,
        net: 0,
        discounts: 0,
        tax: 0,
        refunds: 0,
        orders: 0,
        units: 0,
        aov: 0,
        prevNet: 0,
        delta: null,
        share: 0,
      };
      rows.set(k, r);
    }
    return r;
  };

  for (const o of current) {
    if (filter && !filter(o)) continue;
    const r = ensure(o);
    r.tax += taxOf(o);
    if (isRefunded(o)) {
      r.refunds += refundValueOf(o);
      continue;
    }
    r.gross += grossOf(o);
    r.discounts += discountOf(o);
    r.units += qtyOf(o);
    r.orders += 1;
  }

  const prevNet = new Map<string, number>();
  if (previous) {
    for (const o of previous) {
      if (filter && !filter(o)) continue;
      const k = keyFn(o);
      prevNet.set(k, (prevNet.get(k) ?? 0) + netOf(o));
    }
  }

  let totalNet = 0;
  for (const r of rows.values()) {
    r.net = r.gross - r.discounts - r.refunds;
    r.aov = r.orders ? r.net / r.orders : 0;
    r.prevNet = prevNet.get(r.key) ?? 0;
    r.delta = previous ? pctDelta(r.net, r.prevNet) : null;
    totalNet += r.net;
  }
  for (const r of rows.values()) r.share = totalNet ? r.net / totalNet : 0;

  return [...rows.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

export { pctDelta };
