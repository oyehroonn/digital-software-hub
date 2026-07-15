/**
 * reportMetrics — pure, context-free derivations shared by the Marketing,
 * Products/Inventory and Finances reports.
 *
 * Everything here is a plain function over the STABLE Telemetry + Orders shapes
 * (no React, no date-range context) so each report can scope its own current /
 * previous window (via the global `useDateRange()`) and then call these to reduce
 * the rows. Event predicates are tolerant (regex over event / eventType) so they
 * light up on both the live sheet and the deterministic seed.
 *
 * A few Shopify-parity metrics (unit cost / COGS, on-hand stock, per-order
 * discount & return, tax rate) have no column in the current sheet. Where a real
 * column exists we read it; otherwise we DERIVE a stable value from a
 * deterministic hash of the row so the reports are fully populated and repeatable
 * — every such figure is surfaced in the UI as "modeled".
 */
import type { Order, TelemetryEvent } from "@/lib/ecommerce";

/* ------------------------------- scalars --------------------------------- */

export function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export const evTime = (r: { timestamp?: unknown; received_at?: unknown }): number =>
  Date.parse(String(r.timestamp ?? r.received_at ?? ""));

export function qtyOf(o: Order): number {
  const q = toNum(o.quantity);
  return q > 0 ? q : 1;
}

export function priceOf(o: Order): number {
  return toNum(o.price);
}

/** Gross line value = unit price × quantity. */
export function grossOf(o: Order): number {
  return priceOf(o) * qtyOf(o);
}

/* ---------------------------- event predicates ---------------------------- */

const evName = (e: TelemetryEvent): string => String(e.event ?? e.eventType ?? "").toLowerCase();

const PRODUCT_VIEW_RE = /product_?view|pdp_?view|view_?item|product_?detail/;
const ADD_CART_RE = /add_?to_?cart|cart_?add|add_?cart/;
const PAGE_VIEW_RE = /page_?view|screen_?view|session_?start|visit/;
const ORDER_RE = /^order$|purchase|checkout_?complete|order_?complete|transaction/;
const CHECKOUT_RE = /begin_?checkout|checkout_?start|start_?checkout/;
const SEARCH_RE = /search/;

export const isProductView = (e: TelemetryEvent): boolean =>
  PRODUCT_VIEW_RE.test(evName(e)) || (String(e.eventType ?? "").toLowerCase() === "view" && !!e.productId);
export const isAddToCart = (e: TelemetryEvent): boolean => ADD_CART_RE.test(evName(e));
export const isPageView = (e: TelemetryEvent): boolean => PAGE_VIEW_RE.test(evName(e));
export const isOrderEvent = (e: TelemetryEvent): boolean => ORDER_RE.test(evName(e));
export const isCheckout = (e: TelemetryEvent): boolean => CHECKOUT_RE.test(evName(e));
export const isSearch = (e: TelemetryEvent): boolean => SEARCH_RE.test(evName(e));
export const isClick = (e: TelemetryEvent): boolean =>
  String(e.eventType ?? "").toLowerCase() === "click" || /click|tap|cta/.test(evName(e));

export const sessKey = (e: TelemetryEvent): string => String(e.sessionId ?? e.anonymousId ?? "");

export function metaOf(e: TelemetryEvent): Record<string, unknown> {
  const m = e.metadata;
  if (m && typeof m === "object") return m as Record<string, unknown>;
  if (typeof m === "string") {
    try {
      const o = JSON.parse(m);
      return o && typeof o === "object" ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function metaStr(m: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = m[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
}

export function metaNum(m: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = m[k];
    if (v != null && v !== "") return toNum(v);
  }
  return 0;
}

/* -------------------------------- product --------------------------------- */

export interface ProductInfo {
  id: string;
  name: string;
  price: number;
}

export const productKeyOfOrder = (o: Order): string =>
  String(o.productId ?? o.productName ?? o.sku ?? "—");

export const productKeyOfEvent = (e: TelemetryEvent): string => {
  const m = metaOf(e);
  return String(e.productId ?? metaStr(m, "productId", "product_id", "productName", "product_name") ?? "");
};

/** Build id → {name, price} from both orders and events (orders win on price). */
export function buildProductIndex(events: TelemetryEvent[], orders: Order[]): Map<string, ProductInfo> {
  const idx = new Map<string, ProductInfo>();
  const put = (id: string, name?: string, price?: number) => {
    if (!id) return;
    const cur = idx.get(id) ?? { id, name: id, price: 0 };
    if (name && (cur.name === id || !cur.name)) cur.name = name;
    if (price && price > 0) cur.price = price;
    idx.set(id, cur);
  };
  for (const o of orders) put(productKeyOfOrder(o), String(o.productName ?? ""), priceOf(o));
  for (const e of events) {
    const id = productKeyOfEvent(e);
    if (!id) continue;
    const m = metaOf(e);
    put(id, metaStr(m, "productName", "product_name") || String(e.elementText ?? ""), metaNum(m, "price", "value"));
  }
  return idx;
}

/* ------------------------------- referrers -------------------------------- */

export function referrerLabel(raw: string): string {
  const s = (raw || "").toLowerCase().trim();
  if (!s || s === "direct" || s === "(direct)" || s === "none") return "Direct";
  let host = s;
  try {
    if (/^https?:\/\//.test(s)) host = new URL(s).hostname;
  } catch {
    /* keep s */
  }
  host = host.replace(/^www\./, "").replace(/^l\./, "").replace(/^m\./, "");
  if (/google\./.test(host)) return "google";
  if (/bing\./.test(host)) return "bing";
  if (/facebook\./.test(host)) return "facebook";
  if (/linkedin\./.test(host)) return "linkedin";
  if (/instagram\./.test(host)) return "instagram";
  if (/t\.co|twitter\.|x\.com/.test(host)) return "twitter";
  if (/duckduckgo\./.test(host)) return "duckduckgo";
  return host || "Direct";
}

/* --------------------- deterministic Shopify-parity model ----------------- */

/** Stable [0,1) hash of a string (FNV-1a) — repeatable "modeled" figures. */
export function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Cost of goods ratio per product (0.42–0.66 of retail) — modeled, stable. */
export function costRatioOf(id: string): number {
  return 0.42 + hash01(`cost:${id}`) * 0.24;
}

/** On-hand stock per product (24–520 units) — modeled, stable. */
export function stockOf(id: string): number {
  return 24 + Math.floor(hash01(`stock:${id}`) * 496);
}

const TAX_RATES: Record<string, number> = {
  AU: 0.1, // GST
  GB: 0.2, // VAT
  DE: 0.19,
  AE: 0.05,
  SG: 0.09,
  CA: 0.13,
  US: 0.08,
};
export function taxRateFor(country: string): number {
  return TAX_RATES[String(country || "").toUpperCase()] ?? 0.1;
}

/** Order-level economics. Reads real columns when present; else models them. */
export interface OrderFinance {
  gross: number;
  discount: number;
  refund: number; // magnitude of refunded value (0 when not returned)
  tax: number;
  cogs: number;
  returned: boolean;
  modeled: boolean;
}

const field = (o: Order, ...keys: string[]): unknown => {
  const bag = o as Record<string, unknown>;
  for (const k of keys) {
    const v = bag[k];
    if (v != null && v !== "") return v;
  }
  return undefined;
};

/** True if the dataset carries any real finance columns (discount/tax/refund). */
export function hasRealFinance(orders: Order[]): boolean {
  return orders.some(
    (o) =>
      field(o, "discount", "discount_amount", "discountAmount", "discount_total") != null ||
      field(o, "tax", "tax_amount", "taxAmount", "vat", "gst") != null ||
      field(o, "refund", "refund_amount", "refunded", "status", "financial_status") != null,
  );
}

export function orderFinance(o: Order, real: boolean): OrderFinance {
  const gross = grossOf(o);
  const id = productKeyOfOrder(o);
  const cogs = gross * costRatioOf(id);
  const country = String(o.country ?? "");

  if (real) {
    const discount = toNum(field(o, "discount", "discount_amount", "discountAmount", "discount_total"));
    const refund = toNum(field(o, "refund", "refund_amount", "refunded", "refund_total"));
    const status = String(field(o, "status", "financial_status", "financialStatus") ?? "").toLowerCase();
    const returned = refund > 0 || /refund|return|charge_?back|cancel/.test(status);
    const taxCol = field(o, "tax", "tax_amount", "taxAmount", "vat", "gst");
    const tax = taxCol != null ? toNum(taxCol) : (gross - discount) * taxRateFor(country);
    return {
      gross,
      discount,
      refund: returned ? (refund > 0 ? refund : gross) : 0,
      tax,
      cogs,
      returned,
      modeled: false,
    };
  }

  // Modeled: campaign-attributed orders discount harder; ~6% return rate.
  const key = `${o.timestamp}|${id}|${o.customerName ?? ""}|${o.email ?? ""}`;
  const promo = /via\s+\S+\/\S+/i.test(String(o.notes ?? "")); // "via facebook/summer_sale"
  const discRate = promo ? 0.05 + hash01(`disc:${key}`) * 0.15 : hash01(`disc:${key}`) * 0.06;
  const discount = gross * discRate;
  const returned = hash01(`ret:${key}`) < 0.06;
  const net = gross - discount;
  const tax = returned ? 0 : net * taxRateFor(country);
  return {
    gross,
    discount,
    refund: returned ? gross : 0,
    tax,
    cogs,
    returned,
    modeled: true,
  };
}

/* --------------------------------- misc ----------------------------------- */

/** ABC class from a cumulative revenue share (Pareto): A ≤80%, B ≤95%, else C. */
export function abcClass(cumShare: number): "A" | "B" | "C" {
  if (cumShare <= 0.8) return "A";
  if (cumShare <= 0.95) return "B";
  return "C";
}
