/**
 * Telemetry client — fire-and-forget events to the STABLE Ecommerce Apps Script.
 *
 * This is the one backend AI features are allowed to depend on for reporting,
 * because it is always assumed up. All calls use `mode: "no-cors"` so they never
 * throw in the page, never need CORS, and never block rendering. No secret is
 * sent from the browser (telemetry does not require the shared secret).
 */

// The Apps Script exec URL is public (not a secret). Overridable via env.
const TELEMETRY_URL =
  import.meta.env.VITE_ECOMMERCE_API ||
  'https://script.google.com/macros/s/AKfycbwn05r3WVqMpV4Tftn4n1qEs7I10cu3Z8S306jMXaXXCClxizt2EfOUSKa9cTha6pPD/exec';

const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'DSM';

/** Unstable backends whose outages we report. */
export type AiBackend = 'vps' | 'codex' | 'simli';

export interface TelemetryEvent {
  event: string;
  eventType?: string;
  pageUrl?: string;
  elementId?: string;
  elementText?: string;
  x?: number;
  y?: number;
  direction?: string;
  productId?: string | number;
  metadata?: Record<string, unknown>;
}

// ── Anonymous identity (persisted, best-effort) ─────────────────────────────

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function uid(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rnd}`;
}

function getAnonymousId(): string {
  const store = safeStorage();
  if (!store) return uid('anon');
  let id = store.getItem('dsm-anonymous-id');
  if (!id) {
    id = uid('anon');
    try {
      store.setItem('dsm-anonymous-id', id);
    } catch {
      /* ignore quota / private mode */
    }
  }
  return id;
}

function getSessionId(): string {
  try {
    if (typeof sessionStorage === 'undefined') return uid('sess');
    let id = sessionStorage.getItem('dsm-session-id');
    if (!id) {
      id = uid('sess');
      sessionStorage.setItem('dsm-session-id', id);
    }
    return id;
  } catch {
    return uid('sess');
  }
}

// ── Core sender ─────────────────────────────────────────────────────────────

/**
 * Fire-and-forget a telemetry event. Never throws, never awaits meaningfully.
 * Uses `no-cors` + `text/plain` to match the Apps Script contract.
 */
export function sendTelemetry(evt: TelemetryEvent): void {
  if (typeof fetch === 'undefined') return;

  const payload = {
    type: 'telemetry',
    storeName: STORE_NAME,
    sessionId: getSessionId(),
    anonymousId: getAnonymousId(),
    pageUrl: typeof location !== 'undefined' ? location.href : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    ...evt,
  };

  try {
    void fetch(TELEMETRY_URL, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    }).catch(() => {
      /* fire-and-forget: swallow all network errors */
    });
  } catch {
    /* never let telemetry break the page */
  }
}

/**
 * Report an unstable-backend outage. Called by <AIFeature> whenever a health
 * check fails, per the resilience contract:
 *   event="ai_outage", metadata={ service, feature, error }
 */
export function reportAiOutage(
  service: AiBackend,
  feature: string,
  error?: unknown
): void {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error != null
          ? String(error)
          : 'health-check-failed';

  sendTelemetry({
    event: 'ai_outage',
    eventType: 'error',
    metadata: { service, feature, error: message },
  });
}
