/**
 * Orders & Fulfillment — shared data layer.
 *
 * Reads the STABLE Orders sheet (via lib/ecommerce). Because that sheet is the
 * source of truth but is READ-ONLY from the admin app, every admin-side workflow
 * state (pipeline stage, license delivery, refunds/issues) is kept in a local
 * overlay (localStorage) keyed by a stable order key. The overlay is merged on
 * top of the sheet so the two never fight.
 *
 * Loaders return REAL data only — when the Orders/Telemetry sheet has no rows
 * they return empty arrays (`isEmpty: true`) so the UI shows a clean empty
 * state, never fabricated orders.
 */
import { useCallback, useEffect, useState } from "react";
import type { AppConfig } from "@/lib/config";
import { fetchOrders, fetchTelemetry, type Order, type TelemetryEvent } from "@/lib/ecommerce";

/* ------------------------------------------------------------------ *
 * Pipeline model
 * ------------------------------------------------------------------ */
export type Stage = "new" | "contacted" | "quoted" | "won" | "lost";

export const STAGES: { key: Stage; label: string; tone: string }[] = [
  { key: "new", label: "New", tone: "sky" },
  { key: "contacted", label: "Contacted", tone: "violet" },
  { key: "quoted", label: "Quoted", tone: "amber" },
  { key: "won", label: "Won", tone: "emerald" },
  { key: "lost", label: "Lost", tone: "rose" },
];

/** Infer a starting stage from whatever the sheet's `status`/`notes` say. */
export function inferStage(o: Order): Stage {
  const s = `${o.status ?? ""} ${o.notes ?? ""}`.toLowerCase();
  if (/refund|cancel|lost|declin/.test(s)) return "lost";
  if (/paid|complete|fulfilled|won|delivered|shipped/.test(s)) return "won";
  if (/quote|proposal/.test(s)) return "quoted";
  if (/contact|call|email|reach/.test(s)) return "contacted";
  return "new";
}

/* ------------------------------------------------------------------ *
 * Stable order key + money helpers
 * ------------------------------------------------------------------ */
export function orderKey(o: Order): string {
  const parts = [
    o.timestamp ?? "",
    (o.email ?? o.phone ?? o.customerName ?? "").toString().toLowerCase(),
    o.productId ?? o.sku ?? o.productName ?? "",
    o.quantity ?? "",
  ];
  return parts.join("|").replace(/\s+/g, " ").trim() || JSON.stringify(o).slice(0, 80);
}

export function orderValue(o: Order): number {
  const p = parseFloat(String(o.price ?? "").replace(/[^0-9.]/g, "")) || 0;
  const q = parseFloat(String(o.quantity ?? 1)) || 1;
  return p * q;
}

export function orderCurrency(o: Order): string {
  return (o.currency && String(o.currency)) || "USD";
}

export function customerLabel(o: Order): string {
  return o.customerName || o.email || o.phone || "Unknown";
}

/* ------------------------------------------------------------------ *
 * OLD-WEB deep links (order/customer/product) + copy
 * ------------------------------------------------------------------ */
const OLD_WEB_KEY = "dsm-admin.oldWebBase";
export const DEFAULT_OLD_WEB = "https://dsmsolutions.com.au";

export function getOldWebBase(): string {
  try {
    return (localStorage.getItem(OLD_WEB_KEY) || DEFAULT_OLD_WEB).replace(/\/+$/, "");
  } catch {
    return DEFAULT_OLD_WEB;
  }
}
export function setOldWebBase(url: string) {
  try {
    localStorage.setItem(OLD_WEB_KEY, url.trim());
  } catch {
    /* ignore */
  }
}

/** Deep link into the legacy store admin for an order (search by email). */
export function orderDeepLink(o: Order): string {
  const base = getOldWebBase();
  const q = encodeURIComponent(String(o.email || o.customerName || ""));
  return `${base}/admin/orders?search=${q}`;
}
/** Deep link to the legacy product page. */
export function productDeepLink(o: Order): string {
  const base = getOldWebBase();
  return o.productId
    ? `${base}/product/${encodeURIComponent(String(o.productId))}`
    : `${base}/search?q=${encodeURIComponent(String(o.productName ?? ""))}`;
}

/* ------------------------------------------------------------------ *
 * Admin overlay store (pipeline stage + fulfillment + generic fields)
 * ------------------------------------------------------------------ */
export interface OrderOverlay {
  stage?: Stage;
  delivered?: boolean;
  licenseKey?: string;
  deliveredAt?: number;
  contactedAt?: number;
  quotedAt?: number;
  note?: string;
}

const OVERLAY_KEY = "dsm-admin.orders.overlay";
type OverlayMap = Record<string, OrderOverlay>;
type OverlayListener = (m: OverlayMap) => void;
const overlayListeners = new Set<OverlayListener>();

function readOverlay(): OverlayMap {
  try {
    const raw = localStorage.getItem(OVERLAY_KEY);
    return raw ? (JSON.parse(raw) as OverlayMap) : {};
  } catch {
    return {};
  }
}
function writeOverlay(m: OverlayMap) {
  try {
    localStorage.setItem(OVERLAY_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
  overlayListeners.forEach((l) => l(m));
}

export function getOverlay(key: string): OrderOverlay {
  return readOverlay()[key] ?? {};
}
export function patchOverlay(key: string, p: Partial<OrderOverlay>) {
  const m = readOverlay();
  m[key] = { ...m[key], ...p };
  writeOverlay(m);
}
export function subscribeOverlay(fn: OverlayListener): () => void {
  overlayListeners.add(fn);
  fn(readOverlay());
  return () => {
    overlayListeners.delete(fn);
  };
}

/** Effective stage = overlay override, else inferred from the sheet. */
export function stageOf(o: Order, m: OverlayMap): Stage {
  return m[orderKey(o)]?.stage ?? inferStage(o);
}

/** React hook giving the live overlay map + a re-render on any change. */
export function useOverlay(): OverlayMap {
  const [m, setM] = useState<OverlayMap>(readOverlay);
  useEffect(() => subscribeOverlay(setM), []);
  return m;
}

/* ------------------------------------------------------------------ *
 * Refund / issue log (separate keyed list)
 * ------------------------------------------------------------------ */
export type RefundStatus = "open" | "refunded" | "resolved" | "rejected";
export interface RefundEntry {
  id: string;
  orderKey: string;
  customer: string;
  email?: string;
  product?: string;
  amount?: number;
  currency?: string;
  reason: string;
  status: RefundStatus;
  createdAt: number;
  updatedAt: number;
}

const REFUND_KEY = "dsm-admin.orders.refunds";
type RefundListener = (r: RefundEntry[]) => void;
const refundListeners = new Set<RefundListener>();

function readRefunds(): RefundEntry[] {
  try {
    const raw = localStorage.getItem(REFUND_KEY);
    return raw ? (JSON.parse(raw) as RefundEntry[]) : [];
  } catch {
    return [];
  }
}
function writeRefunds(r: RefundEntry[]) {
  try {
    localStorage.setItem(REFUND_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
  refundListeners.forEach((l) => l(r));
}
export function getRefunds(): RefundEntry[] {
  return readRefunds();
}
export function subscribeRefunds(fn: RefundListener): () => void {
  refundListeners.add(fn);
  fn(readRefunds());
  return () => {
    refundListeners.delete(fn);
  };
}
export function addRefund(e: Omit<RefundEntry, "id" | "createdAt" | "updatedAt">): RefundEntry {
  const entry: RefundEntry = {
    ...e,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  writeRefunds([entry, ...readRefunds()]);
  return entry;
}
export function updateRefund(id: string, p: Partial<RefundEntry>) {
  writeRefunds(readRefunds().map((r) => (r.id === id ? { ...r, ...p, updatedAt: Date.now() } : r)));
}
export function removeRefund(id: string) {
  writeRefunds(readRefunds().filter((r) => r.id !== id));
}
export function useRefunds(): RefundEntry[] {
  const [r, setR] = useState<RefundEntry[]>(readRefunds);
  useEffect(() => subscribeRefunds(setR), []);
  return r;
}

/* ------------------------------------------------------------------ *
 * Customer grouping / repeat-buyer detection
 * ------------------------------------------------------------------ */
export interface CustomerGroup {
  key: string;
  name: string;
  email?: string;
  phone?: string;
  orders: Order[];
  count: number;
  total: number;
  currency: string;
  firstAt?: number;
  lastAt?: number;
  products: string[];
}

export function groupByCustomer(orders: Order[]): CustomerGroup[] {
  const map = new Map<string, CustomerGroup>();
  for (const o of orders) {
    const key = (o.email || o.phone || o.customerName || "unknown").toString().toLowerCase();
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        name: o.customerName || o.email || o.phone || "Unknown",
        email: o.email,
        phone: o.phone,
        orders: [],
        count: 0,
        total: 0,
        currency: orderCurrency(o),
        products: [],
      };
      map.set(key, g);
    }
    g.orders.push(o);
    g.count += 1;
    g.total += orderValue(o);
    const t = o.timestamp ? Date.parse(String(o.timestamp)) : NaN;
    if (!Number.isNaN(t)) {
      g.firstAt = g.firstAt == null ? t : Math.min(g.firstAt, t);
      g.lastAt = g.lastAt == null ? t : Math.max(g.lastAt, t);
    }
    const pn = o.productName || o.sku;
    if (pn && !g.products.includes(String(pn))) g.products.push(String(pn));
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/* ------------------------------------------------------------------ *
 * Loaders — REAL data only (empty state when the sheet has no rows)
 * ------------------------------------------------------------------ */
export interface OrdersState {
  orders: Order[];
  loading: boolean;
  error: string | null;
  /** True when the Orders sheet returned no rows → render an empty state. */
  isEmpty: boolean;
  reload: () => void;
}

export function useOrdersData(config: AppConfig): OrdersState {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchOrders(config)
      .then((rows) => {
        if (!alive) return;
        setOrders(rows);
      })
      .catch((e) => {
        if (!alive) return;
        setOrders([]);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [config]);

  useEffect(() => reload(), [reload]);
  return { orders, loading, error, isEmpty: orders.length === 0, reload };
}

export interface TelemetryState {
  events: TelemetryEvent[];
  loading: boolean;
  isEmpty: boolean;
  reload: () => void;
}

export function useTelemetryData(config: AppConfig): TelemetryState {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    let alive = true;
    setLoading(true);
    fetchTelemetry(config)
      .then((rows) => {
        if (!alive) return;
        setEvents(rows);
      })
      .catch(() => {
        if (!alive) return;
        setEvents([]);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [config]);

  useEffect(() => reload(), [reload]);
  return { events, loading, isEmpty: events.length === 0, reload };
}
