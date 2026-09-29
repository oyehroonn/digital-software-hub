/**
 * Analytics / Telemetry client — STABLE backend
 * ----------------------------------------------
 * Posts telemetry to the DSM Analytics API (self-hosted, CSV-backed Flask
 * service on the VPS — see ~/.rpidrive/notes/dsm-analytics-csv-api.md). This
 * replaced the old Ecommerce Google Apps Script sink (2026-09-23): same
 * `type:"order"` / `type:"telemetry"` contract, now backed by orders.csv /
 * telemetry.csv instead of Google Sheets. This backend is treated as ALWAYS UP
 * (see resilience contract), so calls here are fire-and-forget and must never
 * block or break the page.
 *
 * Transport details (must match the DSM Analytics API contract):
 *  - POST JSON with Content-Type `text/plain;charset=utf-8` (a "simple" request,
 *    so the browser sends no CORS preflight).
 *  - `mode: "no-cors"` — the browser will not let us read the response, which is
 *    fine: telemetry needs no response and needs no secret.
 *  - No secret is ever included from the browser. Writes are accepted
 *    anonymously (matches the old Apps Script frontend contract); the read
 *    secret lives only in the admin app / server.
 *
 * If the network is genuinely offline the send is quietly parked in the offline
 * queue and retried on reconnect, so we never lose an `ai_outage` signal.
 */

import { enqueue, registerProcessor } from '../offlineQueue';

// The DSM Analytics API URL is a public endpoint (NOT a secret — writes are
// anonymous). Overridable for staging via a gitignored .env.local.
export const ANALYTICS_URL: string =
  (import.meta.env.VITE_ECOMMERCE_APPS_SCRIPT_URL as string | undefined) ??
  'https://dsm-analytics.waleeds.world/';

export const STORE_NAME: string =
  (import.meta.env.VITE_STORE_NAME as string | undefined) ?? 'DSM';

const QUEUE_KIND = 'telemetry';
const SESSION_KEY = 'dsm.sessionId';
const ANON_KEY = 'dsm.anonymousId';

/** High-level buckets so the admin Analytics tab can group events. */
export type TelemetryEventType =
  | 'page'
  | 'click'
  | 'scroll'
  | 'ai'
  | 'ecommerce'
  | 'error'
  | 'custom';

/** Fields accepted by the Apps Script `type:"telemetry"` row. */
export interface TelemetryEvent {
  storeName: string;
  sessionId: string;
  anonymousId: string;
  event: string;
  eventType: TelemetryEventType;
  pageUrl?: string;
  elementId?: string;
  elementText?: string;
  x?: number;
  y?: number;
  direction?: string;
  productId?: string | number;
  metadata?: Record<string, unknown>;
  userAgent?: string;
}

/** The subset a caller supplies; identity + envelope fields are filled in. */
export type TelemetryInput = Partial<
  Omit<TelemetryEvent, 'storeName' | 'sessionId' | 'anonymousId' | 'userAgent'>
> & { event: string };

const hasWindow = typeof window !== 'undefined';

// ── Identity (best-effort, storage-safe) ─────────────────────────────────────

function makeId(prefix: string): string {
  if (hasWindow && 'crypto' in window && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}_${window.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readStored(store: Storage | undefined, key: string, prefix: string): string {
  if (!store) return makeId(prefix);
  try {
    const existing = store.getItem(key);
    if (existing) return existing;
    const created = makeId(prefix);
    store.setItem(key, created);
    return created;
  } catch {
    return makeId(prefix);
  }
}

/** Per-tab session id (sessionStorage). */
export function getSessionId(): string {
  return readStored(hasWindow ? window.sessionStorage : undefined, SESSION_KEY, 'sess');
}

/** Durable anonymous visitor id (localStorage). */
export function getAnonymousId(): string {
  return readStored(hasWindow ? window.localStorage : undefined, ANON_KEY, 'anon');
}

// ── UTM attribution (first-touch, per tab session) ──────────────────────────
//
// Captures utm_* query params on the landing hit and persists them to
// sessionStorage so every telemetry/order/lead call for the rest of THIS tab
// session carries the same attribution, even once the visitor navigates away
// from the original landing URL. Used to attribute traffic/orders back to
// outbound campaigns (e.g. the `waleed_ai` email/LinkedIn/SMS initiative) —
// same utm_source/utm_medium/utm_campaign scheme already used by the
// `blogs.digitalsoftwaremarket.ai` render-time UTM links (ag_blogs).

const UTM_KEY = 'dsm.utm';
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export type UtmContext = Partial<Record<(typeof UTM_FIELDS)[number], string>>;

/** Reads fresh utm_* params from the URL, or falls back to this session's first-touch values. */
export function getUtmContext(): UtmContext | undefined {
  if (!hasWindow) return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    const fresh: UtmContext = {};
    for (const key of UTM_FIELDS) {
      const value = params.get(key);
      if (value) fresh[key] = value;
    }
    if (Object.keys(fresh).length > 0) {
      window.sessionStorage.setItem(UTM_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const stored = window.sessionStorage.getItem(UTM_KEY);
    if (stored) return JSON.parse(stored) as UtmContext;
  } catch {
    // sessionStorage unavailable (private mode, etc.) — no attribution, not fatal.
  }
  return undefined;
}

/** Renders a UTM context as a single human-readable line for a free-text `notes` field. */
export function utmNoteLine(utm: UtmContext | undefined): string {
  if (!utm || Object.keys(utm).length === 0) return '';
  const parts = UTM_FIELDS.filter((k) => utm[k]).map((k) => `${k}=${utm[k]}`);
  return parts.length ? `UTM: ${parts.join(' ')}` : '';
}

// ── Transport ────────────────────────────────────────────────────────────────

function buildEvent(input: TelemetryInput): TelemetryEvent {
  const utm = getUtmContext();
  return {
    storeName: STORE_NAME,
    sessionId: getSessionId(),
    anonymousId: getAnonymousId(),
    eventType: 'custom',
    pageUrl: hasWindow ? window.location.href : undefined,
    userAgent: hasWindow ? navigator.userAgent : undefined,
    ...input,
    metadata: utm ? { ...utm, ...(input.metadata ?? {}) } : input.metadata,
  };
}

/** Raw send. Resolves on success; rejects so the offline queue can retry. */
async function postTelemetry(payload: { type: 'telemetry' } & TelemetryEvent): Promise<void> {
  const res = await fetch(ANALYTICS_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    keepalive: true, // survive page unload for last-gasp events
  });
  // With mode:"no-cors" the response is opaque (res.ok is always false / status 0);
  // reaching here at all means the request left the browser. A thrown error means
  // the network was down — let the queue retry.
  void res;
}

// Register the offline-queue processor once at module load.
registerProcessor<{ type: 'telemetry' } & TelemetryEvent>(QUEUE_KIND, (p) => postTelemetry(p));

/**
 * Track a telemetry event. Fire-and-forget: never throws, never awaited by the
 * UI. On network failure the event is queued and retried on reconnect.
 */
export function track(input: TelemetryInput): void {
  const payload = { type: 'telemetry' as const, ...buildEvent(input) };
  postTelemetry(payload).catch(() => {
    // Network down → park it for the reconnect flush.
    enqueue(QUEUE_KIND, payload);
  });
}

/** Convenience: page view. */
export function trackPageView(pageUrl?: string): void {
  track({
    event: 'page_view',
    eventType: 'page',
    pageUrl: pageUrl ?? (hasWindow ? window.location.href : undefined),
  });
}

/** Convenience: a click on a tracked element. */
export function trackClick(
  event: string,
  opts: { elementId?: string; elementText?: string; x?: number; y?: number; metadata?: Record<string, unknown> } = {},
): void {
  track({ event, eventType: 'click', ...opts });
}

/**
 * Report that an UNSTABLE backend failed. This is the signal the admin
 * Analytics / Health board consumes to surface `ai_outage` incidents.
 *
 * @param service  which backend failed: 'vps' | 'codex-proxy' | 'simli' | string
 * @param feature  which AI feature was affected (e.g. 'instant-quote-genie')
 * @param error    the underlying error (Error, string, or unknown)
 */
export function reportAiOutage(service: string, feature: string, error: unknown): void {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
  track({
    event: 'ai_outage',
    eventType: 'error',
    metadata: { service, feature, error: message },
  });
}
