/**
 * Orders client — STABLE backend
 * -------------------------------
 * Submits orders to the Ecommerce Google Apps Script and (for the admin app /
 * server bridge only) reads them back.
 *
 * Frontend rules (resilience contract):
 *  - The Apps Script SECRET is NEVER shipped in the browser bundle. Submitting
 *    an order does not require it (the web app accepts anonymous POSTs and the
 *    Orders sheet is the source of truth the admin app reads).
 *  - Submission is resilient: we first try a readable (CORS) POST so we can show
 *    the customer a confirmation; if that fails we fall back to a fire-and-forget
 *    `no-cors` POST AND park the order in the offline queue so it is retried on
 *    reconnect. The customer is never blocked by a flaky network.
 *  - READ helpers require the secret and are meant to run from the admin app /
 *    server bridge, which passes the secret explicitly. They must not be called
 *    from committed frontend code with a hardcoded secret.
 */

import { enqueue, registerProcessor } from '../offlineQueue';
import { ANALYTICS_URL, STORE_NAME, getSessionId, getAnonymousId } from './analytics';

const QUEUE_KIND = 'order';

/** Fields accepted by the Apps Script `type:"order"` row. */
export interface OrderPayload {
  storeName?: string;
  customerName: string;
  email: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  productId: string | number;
  productName: string;
  sku?: string;
  quantity: number;
  price: number | string;
  currency?: string;
  notes?: string;
}

export interface OrderResult {
  /** True if the order left the browser (either confirmed or queued). */
  ok: boolean;
  /** True when we got a readable success response back from the Apps Script. */
  confirmed: boolean;
  /** Order id / row ref returned by the Apps Script, when available. */
  orderId?: string;
  /** True when the order was parked in the offline queue instead of confirmed. */
  queued: boolean;
  /** Local correlation id (also the offline-queue id when queued). */
  clientRef: string;
  error?: string;
}

interface OrderEnvelope {
  type: 'order';
  clientRef: string;
  sessionId: string;
  anonymousId: string;
  order: Required<Pick<OrderPayload, 'storeName'>> & OrderPayload;
}

const hasWindow = typeof window !== 'undefined';

function makeRef(): string {
  if (hasWindow && 'crypto' in window && typeof window.crypto.randomUUID === 'function') {
    return `ord_${window.crypto.randomUUID()}`;
  }
  return `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildEnvelope(order: OrderPayload, clientRef: string): OrderEnvelope {
  return {
    type: 'order',
    clientRef,
    sessionId: getSessionId(),
    anonymousId: getAnonymousId(),
    order: { storeName: STORE_NAME, ...order },
  };
}

// ── Submit ───────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget submit used both by the retry queue and by the fallback path.
 * Uses `no-cors`, so the response is opaque; a thrown error means the network
 * was down and the caller/queue should retry.
 */
async function postOrderNoCors(envelope: OrderEnvelope): Promise<void> {
  // Flatten the order fields to the top level: the Apps Script `appendOrder_`
  // reads top-level keys (email / customerName / productName / price …). The
  // nested `order` is retained for raw_json. Without this, orders land blank.
  // keepalive fetch (NOT sendBeacon — Apps Script's cross-origin 302 redirect
  // makes sendBeacon drop the write). The caller awaits this before navigating.
  await fetch(ANALYTICS_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...envelope, ...envelope.order }),
    keepalive: true,
  });
}

// The offline queue drains parked orders via the no-cors path.
registerProcessor<OrderEnvelope>(QUEUE_KIND, (envelope) => postOrderNoCors(envelope));

/**
 * Submit an order.
 *
 * Strategy:
 *  1. Try a readable POST (default CORS mode). Apps Script returns JSON we can
 *     parse to confirm + capture an order id.
 *  2. If that throws (network/CORS/timeout), fall back to a `no-cors` submit and
 *     ALSO enqueue for retry — the customer sees an accepted state either way.
 */
export async function submitOrder(order: OrderPayload, opts: { timeoutMs?: number } = {}): Promise<OrderResult> {
  const clientRef = makeRef();
  const envelope = buildEnvelope(order, clientRef);
  const timeoutMs = opts.timeoutMs ?? 8000;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(ANALYTICS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(t);
    }

    if (!res.ok) throw new Error(`Apps Script responded ${res.status}`);

    // Apps Script returns JSON for readable requests.
    let orderId: string | undefined;
    try {
      const data = (await res.json()) as { orderId?: string; id?: string; row?: number; ok?: boolean };
      orderId = data.orderId ?? data.id ?? (data.row != null ? String(data.row) : undefined);
    } catch {
      // Non-JSON but 2xx — still a success, just no id.
    }

    return { ok: true, confirmed: true, queued: false, clientRef, orderId };
  } catch (err) {
    // Readable path failed. Best-effort no-cors send, then park for retry.
    postOrderNoCors(envelope).catch(() => {
      /* offline — the queue below owns the retry */
    });
    const queued = enqueue(QUEUE_KIND, envelope);
    return {
      ok: true,
      confirmed: false,
      queued: true,
      clientRef: queued.id,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Read helpers (ADMIN APP / SERVER BRIDGE ONLY) ─────────────────────────────
//
// These require the Apps Script secret and MUST be called from the admin app or
// a server bridge that holds the secret in local/OS-keychain config — never from
// committed frontend code with an inline secret.

export interface OrderReadConfig {
  /** Apps Script web-app URL. Defaults to the shared ANALYTICS_URL. */
  url?: string;
  /** The Apps Script secret. Supplied by the admin app's local config. */
  secret: string;
}

export interface OrderRow extends OrderPayload {
  orderId?: string;
  clientRef?: string;
  createdAt?: string;
  status?: string;
}

/** Read orders from the Orders sheet (admin/server only). */
export async function fetchOrders(
  config: OrderReadConfig,
  params: { limit?: number; since?: string } = {},
): Promise<OrderRow[]> {
  const base = config.url ?? ANALYTICS_URL;
  const qs = new URLSearchParams({ action: 'orders', secret: config.secret });
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.since) qs.set('since', params.since);

  const res = await fetch(`${base}?${qs.toString()}`);
  if (!res.ok) throw new Error(`Failed to read orders (${res.status})`);
  const data = (await res.json()) as { orders?: OrderRow[] } | OrderRow[];
  return Array.isArray(data) ? data : data.orders ?? [];
}

/** Read the Apps Script schema (public; no secret required). */
export async function fetchSchema(url: string = ANALYTICS_URL): Promise<Record<string, unknown>> {
  const res = await fetch(`${url}?action=schema`);
  if (!res.ok) throw new Error(`Failed to read schema (${res.status})`);
  return res.json();
}
