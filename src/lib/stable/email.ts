/**
 * Email client — STABLE backend (via local admin bridge)
 * -------------------------------------------------------
 * The mail CLI (`python3 /Users/hico/claude-employee/mailcli.py`) holds a secret
 * and CANNOT be called from the browser. The frontend NEVER holds the mail
 * secret. Instead it talks to a small LOCAL admin bridge (part of the Tauri
 * admin app / a localhost sidecar) that shells out to the CLI on the frontend's
 * behalf.
 *
 * ── Bridge contract (what the admin app must implement) ──────────────────────
 * The bridge exposes ONE JSON endpoint, default `http://localhost:8787/mail`
 * (override with VITE_MAIL_BRIDGE_URL). It maps 1:1 onto mailcli commands:
 *
 *   POST /mail
 *   Content-Type: application/json
 *   Request  body: { "command": <MailCommand>, "args": <object>, "_endpoint"?: <MailEndpoint> }
 *   Response body: { "ok": boolean, "result"?: <any>, "error"?: string }
 *
 * The bridge runs, e.g. for command "sendEmail":
 *   python3 /Users/hico/claude-employee/mailcli.py sendEmail '<JSON args>' [--endpoint <_endpoint>]
 * and returns the CLI's parsed JSON as `result`. The mail secret lives only in
 * the bridge's local config / OS keychain — never in this file, never committed.
 *
 * If the bridge is unreachable (admin app not running), these calls reject; the
 * caller decides whether to surface a message or queue for later.
 */

export const MAIL_BRIDGE_URL: string =
  (import.meta.env.VITE_MAIL_BRIDGE_URL as string | undefined) ?? 'http://localhost:8787/mail';

/** mailcli endpoints (mailbox identities). */
export type MailEndpoint = 'default' | 'personal' | 'techrealm';

/** mailcli commands the bridge forwards. */
export type MailCommand = 'sendEmail' | 'whoami' | 'quota' | 'createEvent' | 'findEvents';

export interface SendEmailArgs {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  /** Set true if `body` is HTML. */
  html?: boolean;
}

export interface CreateEventArgs {
  title: string;
  /** ISO-8601 start, e.g. "2026-07-16T15:00:00+03:00". */
  start: string;
  /** ISO-8601 end. If omitted the bridge/CLI may default to +30min. */
  end?: string;
  attendees?: string[];
  description?: string;
  location?: string;
}

export interface FindEventsArgs {
  /** ISO date/time lower bound. */
  from?: string;
  /** ISO date/time upper bound. */
  to?: string;
  query?: string;
}

export interface MailBridgeResponse<R = unknown> {
  ok: boolean;
  result?: R;
  error?: string;
}

interface BridgeRequest {
  command: MailCommand;
  args: Record<string, unknown>;
  _endpoint?: MailEndpoint;
}

async function callBridge<R = unknown>(req: BridgeRequest, timeoutMs = 15000): Promise<R> {
  // Never attempt an http://localhost fetch from a hosted HTTPS page (mixed
  // content is a hard block + console error). Reject cleanly so callers degrade.
  if (bridgeUnavailableOnHost()) {
    throw new Error('Mail bridge is a local-only sidecar; unavailable on the hosted site.');
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(MAIL_BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `Mail bridge unreachable at ${MAIL_BRIDGE_URL} (is the admin app running?): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) throw new Error(`Mail bridge error ${res.status}`);
  const data = (await res.json()) as MailBridgeResponse<R>;
  if (!data.ok) throw new Error(data.error || 'Mail bridge reported failure');
  return data.result as R;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Send an email (e.g. an AI-generated quote) via the live email proxy.
 * The mailcli bridge isn't reachable from a browser, so we POST to the API's
 * /api/email endpoint, which forwards to the email Apps Script server-side. */
export async function sendEmail(args: SendEmailArgs, _endpoint?: MailEndpoint): Promise<unknown> {
  const base =
    (import.meta.env.VITE_API_BASE as string | undefined) || 'https://dsm-api.techrealm.ai';
  const res = await fetch(`${base}/api/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: args.to, subject: args.subject, body: args.body }),
  });
  const data = await res.json().catch(() => ({} as { ok?: boolean; error?: string }));
  if (!res.ok || !data.ok) throw new Error(data.error || `email failed (${res.status})`);
  return data;
}

/**
 * True when we're on a hosted HTTPS page but the mail bridge is a local
 * `http://localhost` sidecar — it can never be reached (and an http:// fetch
 * would be a mixed-content hard-block). Used to degrade the bridge-only
 * calendar features gracefully instead of throwing / spamming the console.
 */
function bridgeUnavailableOnHost(): boolean {
  return (
    typeof location !== 'undefined' &&
    location.protocol === 'https:' &&
    MAIL_BRIDGE_URL.startsWith('http://')
  );
}

/** Book a calendar event (feature 10 — Smart Callback). */
export function createEvent(args: CreateEventArgs, endpoint?: MailEndpoint): Promise<unknown> {
  // On the hosted site the local calendar bridge is unreachable — resolve as a
  // no-op so the booking flow (confirmation email + lead capture) still runs;
  // the admin creates the calendar entry from the captured lead.
  if (bridgeUnavailableOnHost()) return Promise.resolve({ ok: true, hosted: true, skipped: 'createEvent' });
  return callBridge({ command: 'createEvent', args: { ...args }, _endpoint: endpoint });
}

/** Look up existing events (e.g. offer free slots for a callback). */
export function findEvents(args: FindEventsArgs = {}, endpoint?: MailEndpoint): Promise<unknown> {
  if (bridgeUnavailableOnHost()) return Promise.resolve([]);
  return callBridge({ command: 'findEvents', args: { ...args }, _endpoint: endpoint });
}

/** Identity of the active mailbox. */
export function whoami(endpoint?: MailEndpoint): Promise<unknown> {
  return callBridge({ command: 'whoami', args: {}, _endpoint: endpoint });
}

/** Remaining send quota. */
export function quota(endpoint?: MailEndpoint): Promise<unknown> {
  return callBridge({ command: 'quota', args: {}, _endpoint: endpoint });
}

/** True if the local mail bridge answers (used by the admin Health board). */
export async function isMailBridgeUp(): Promise<boolean> {
  try {
    await whoami();
    return true;
  } catch {
    return false;
  }
}
