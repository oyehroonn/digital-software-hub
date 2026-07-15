/**
 * Reads the STABLE Apps Script backend: Orders sheet + Telemetry sheet.
 * These are the source of truth for the Orders and Analytics tabs.
 *
 * Assumes the Apps Script exposes secret-gated GET actions returning JSON:
 *   GET ?action=orders&secret=...      -> { rows: Order[] }  (or a bare array)
 *   GET ?action=telemetry&secret=...   -> { rows: TelemetryEvent[] }
 * Parsing is defensive so a shape change or outage never throws into the UI.
 */
import { httpGet } from "./rpc";
import type { AppConfig } from "./config";

export interface Order {
  timestamp?: string;
  storeName?: string;
  customerName?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  productId?: string;
  productName?: string;
  sku?: string;
  quantity?: number | string;
  price?: number | string;
  currency?: string;
  notes?: string;
  status?: string;
  [k: string]: unknown;
}

export interface TelemetryEvent {
  timestamp?: string;
  storeName?: string;
  sessionId?: string;
  anonymousId?: string;
  event?: string;
  eventType?: string;
  pageUrl?: string;
  elementId?: string;
  elementText?: string;
  productId?: string;
  metadata?: Record<string, unknown> | string;
  userAgent?: string;
  [k: string]: unknown;
}

function parseRows<T>(text: string): T[] {
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data as T[];
    if (Array.isArray(data?.rows)) return data.rows as T[];
    if (Array.isArray(data?.orders)) return data.orders as T[];
    if (Array.isArray(data?.data)) return data.data as T[];
    if (Array.isArray(data?.events)) return data.events as T[];
    return [];
  } catch {
    return [];
  }
}

/**
 * Base for a read request. Prefers an explicit read-proxy (cfg.telemetry_read_url)
 * when configured — e.g. a small VPS endpoint that mirrors the sheet — otherwise
 * falls back to the stable Apps Script GET (`?action=…`). Either way the secret
 * gates the read and never enters the frontend bundle (admin app / native only).
 */
function readUrl(cfg: AppConfig, action: "telemetry" | "orders", limit: number): string {
  const proxy = (cfg.telemetry_read_url ?? "").trim();
  const sep = (u: string) => (u.includes("?") ? "&" : "?");
  if (proxy) {
    return (
      proxy +
      `${sep(proxy)}action=${action}&limit=${limit}` +
      `&secret=${encodeURIComponent(cfg.ecommerce_secret)}`
    );
  }
  return (
    cfg.ecommerce_url +
    `?action=${action}&limit=${limit}&secret=${encodeURIComponent(cfg.ecommerce_secret)}`
  );
}

export async function fetchOrders(cfg: AppConfig, limit = 2000): Promise<Order[]> {
  const text = await httpGet(readUrl(cfg, "orders", limit), { timeoutMs: 10000 });
  return parseRows<Order>(text).map(normalizeOrder);
}

export async function fetchTelemetry(cfg: AppConfig, limit = 2000): Promise<TelemetryEvent[]> {
  const text = await httpGet(readUrl(cfg, "telemetry", limit), { timeoutMs: 12000 });
  return parseRows<TelemetryEvent>(text).map(normalizeEvent);
}

/** Pick the first non-empty value across snake_case / camelCase aliases. */
function pick(bag: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = bag[k];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

function toNum(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Map the Telemetry sheet's snake_case columns (received_at, event_name,
 * page_url, element_id, metadata_json, …) onto the camelCase TelemetryEvent the
 * whole analytics layer (funnel, scroll map, heatmaps) expects — while leaving
 * data that already arrives camelCase untouched. metadata_json is parsed to an
 * object. Original keys are preserved so nothing that reads them regresses.
 */
function normalizeEvent(raw: TelemetryEvent): TelemetryEvent {
  const bag = raw as Record<string, unknown>;
  const e: TelemetryEvent = { ...raw };

  e.timestamp = (pick(bag, "timestamp", "received_at", "receivedAt", "time") as string) ?? e.timestamp;
  e.storeName = (pick(bag, "storeName", "store_name") as string) ?? e.storeName;
  e.sessionId = (pick(bag, "sessionId", "session_id") as string) ?? e.sessionId;
  e.anonymousId = (pick(bag, "anonymousId", "anonymous_id") as string) ?? e.anonymousId;
  e.userId = (pick(bag, "userId", "user_id") as string) ?? (e as Record<string, unknown>).userId;
  e.event = (pick(bag, "event", "event_name", "eventName", "name") as string) ?? e.event;
  e.eventType = (pick(bag, "eventType", "event_type", "interaction_type") as string) ?? e.eventType;
  e.pageUrl = (pick(bag, "pageUrl", "page_url", "url", "href") as string) ?? e.pageUrl;
  e.elementId = (pick(bag, "elementId", "element_id") as string) ?? e.elementId;
  e.elementText = (pick(bag, "elementText", "element_text", "label") as string) ?? e.elementText;
  e.productId = (pick(bag, "productId", "product_id") as string) ?? e.productId;
  e.userAgent = (pick(bag, "userAgent", "user_agent") as string) ?? e.userAgent;

  const dir = pick(bag, "direction", "swipeDirection");
  if (dir != null) (e as Record<string, unknown>).direction = dir;
  const x = toNum(pick(bag, "x", "clientX"));
  const y = toNum(pick(bag, "y", "clientY"));
  if (x != null) e.x = x;
  if (y != null) e.y = y;

  const m = pick(bag, "metadata", "metadata_json", "meta", "properties");
  if (typeof m === "string") {
    try {
      e.metadata = JSON.parse(m);
    } catch {
      e.metadata = m;
    }
  } else if (m && typeof m === "object") {
    e.metadata = m as Record<string, unknown>;
  }
  return e;
}

/** Map snake_case Orders columns onto the camelCase Order shape (leaves camelCase intact). */
function normalizeOrder(raw: Order): Order {
  const bag = raw as Record<string, unknown>;
  const o: Order = { ...raw };
  o.timestamp = (pick(bag, "timestamp", "received_at", "receivedAt") as string) ?? o.timestamp;
  o.storeName = (pick(bag, "storeName", "store_name") as string) ?? o.storeName;
  o.customerName = (pick(bag, "customerName", "customer_name") as string) ?? o.customerName;
  o.addressLine1 = (pick(bag, "addressLine1", "address_line1") as string) ?? o.addressLine1;
  o.addressLine2 = (pick(bag, "addressLine2", "address_line2") as string) ?? o.addressLine2;
  o.postalCode = (pick(bag, "postalCode", "postal_code") as string) ?? o.postalCode;
  o.productId = (pick(bag, "productId", "product_id") as string) ?? o.productId;
  o.productName = (pick(bag, "productName", "product_name") as string) ?? o.productName;
  return o;
}
