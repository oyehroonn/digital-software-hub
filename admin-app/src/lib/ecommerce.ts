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

export async function fetchOrders(cfg: AppConfig): Promise<Order[]> {
  const url = `${cfg.ecommerce_url}?action=orders&secret=${encodeURIComponent(cfg.ecommerce_secret)}`;
  const text = await httpGet(url, { timeoutMs: 10000 });
  return parseRows<Order>(text);
}

export async function fetchTelemetry(cfg: AppConfig, limit = 2000): Promise<TelemetryEvent[]> {
  const url =
    `${cfg.ecommerce_url}?action=telemetry&limit=${limit}` +
    `&secret=${encodeURIComponent(cfg.ecommerce_secret)}`;
  const text = await httpGet(url, { timeoutMs: 12000 });
  return parseRows<TelemetryEvent>(text).map(normalizeEvent);
}

function normalizeEvent(e: TelemetryEvent): TelemetryEvent {
  if (typeof e.metadata === "string") {
    try {
      e.metadata = JSON.parse(e.metadata);
    } catch {
      /* leave as string */
    }
  }
  return e;
}
