/**
 * Reads the Orders sheet + Telemetry sheet DIRECTLY as CSV (the "oleaf"
 * pattern) — the sheets are shared "anyone with link: Viewer" and served from
 * their `/export?format=csv` endpoint via `lib/sheets` (Tauri http bridge, or
 * the VPS read-proxy in the browser). Both are the source of truth for the
 * Orders and Analytics tabs.
 *
 * The CSV headers are the sheet's snake_case columns (received_at, event_name,
 * page_url, metadata_json, customer_name, product_id, …); `normalizeEvent` /
 * `normalizeOrder` map them onto the camelCase shapes the app expects. Reads
 * are defensive: a not-yet-published sheet or an outage yields `[]`, never a
 * throw — REAL data only, so the UI shows a clean empty state (never fabricated
 * rows) until the sheet is shared.
 */
import { fetchSheetRows } from "./sheets";
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

export async function fetchOrders(cfg: AppConfig, limit = 2000): Promise<Order[]> {
  // Generous timeout: the Apps Script read follows a 302 → googleusercontent
  // redirect and serialises up to `limit` rows, which can take 10-20s.
  const rows = await fetchSheetRows(cfg, cfg.orders_sheet_id, { timeoutMs: 25000 });
  const mapped = rows.map((r) => normalizeOrder(r as unknown as Order));
  return limit && mapped.length > limit ? mapped.slice(-limit) : mapped;
}

export async function fetchTelemetry(cfg: AppConfig, limit = 2000): Promise<TelemetryEvent[]> {
  // Telemetry is the big read (~2KB/row) — the 2000-row window is ~4MB and the
  // Apps Script + redirect can take ~10-15s, so allow 30s before falling back.
  const rows = await fetchSheetRows(cfg, cfg.telemetry_sheet_id, { timeoutMs: 30000 });
  const mapped = rows.map((r) => normalizeEvent(r as unknown as TelemetryEvent));
  return limit && mapped.length > limit ? mapped.slice(-limit) : mapped;
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
