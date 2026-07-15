/**
 * Accounts / Auth foundation — "easy login", STABLE backend only
 * ---------------------------------------------------------------
 * Free, lightweight, passwordless sign-in for the DSM storefront. There is no
 * user database and no password: identity is a *verified email* held in a
 * client-side session, and the durable record of the person lives in the
 * STABLE Ecommerce Apps Script (Orders sheet + a member event on the Telemetry
 * sheet). This module NEVER talks to the unstable VPS.
 *
 * Two verification strengths, both free:
 *  - Lightweight  — `signIn(email)` trusts the typed address and opens a
 *    session immediately. Good enough to greet a returning buyer and show their
 *    licenses (which are themselves scoped to that email on the server).
 *  - Magic-code   — `requestLoginCode(email)` emails a 6-digit code through the
 *    local mail bridge; `verifyLoginCode(email, code)` proves inbox control and
 *    opens a `verified: true` session. Optional; degrades to lightweight if the
 *    admin mail bridge is not running.
 *
 * Resilience contract:
 *  - Recording the member is fire-and-forget (`no-cors`) — sign-in never blocks
 *    or fails on a flaky network.
 *  - Reading licenses is a readable, secret-free GET scoped by the verified
 *    email (`action=licenses&email=…`). Any failure degrades to `[]`; the page
 *    is never broken by an Orders read.
 *  - The Apps Script SECRET is never shipped to the browser.
 */

import {
  ANALYTICS_URL,
  STORE_NAME,
  getAnonymousId,
  getSessionId,
  track,
} from './stable/analytics';
import { sendEmail } from './stable/email';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Account {
  /** Normalised (lower-cased, trimmed) email — the account key. */
  email: string;
  /** True when opened via the magic-code flow (inbox control proven). */
  verified: boolean;
  /** ISO timestamp the session was opened. */
  signedInAt: string;
  /** Telemetry anonymous id this account is linked to (for funnel stitching). */
  anonymousId: string;
  /** Optional friendly name the caller supplied. */
  displayName?: string;
}

export type LicenseStatus = 'active' | 'expired' | 'lifetime';

export interface License {
  /** Human product name (falls back to product id). */
  product: string;
  productId?: string;
  sku?: string;
  quantity?: number;
  /** ISO timestamp of purchase. */
  purchasedAt: string;
  /** ISO expiry; `undefined` means a perpetual / lifetime license. */
  expiresAt?: string;
  status: LicenseStatus;
  /** Order id / client ref when the sheet provides one. */
  orderRef?: string;
}

export interface SignInOptions {
  displayName?: string;
  /** Marks the session as inbox-verified (set by the magic-code path). */
  verified?: boolean;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const SESSION_KEY = 'dsm.account';
const CODE_KEY = 'dsm.account.pendingCode';
const CODE_TTL_MS = 10 * 60 * 1000; // magic codes live 10 minutes

const hasWindow = typeof window !== 'undefined';

// ── Small helpers ─────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalise + validate an email. Returns the clean value or throws. */
export function normalizeEmail(email: string): string {
  const clean = String(email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) throw new Error('Please enter a valid email address.');
  return clean;
}

/** True when the string looks like a usable email (no throw). */
export function isValidEmail(email: string): boolean {
  try {
    normalizeEmail(email);
    return true;
  } catch {
    return false;
  }
}

function localStore(): Storage | undefined {
  try {
    return hasWindow ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function readJSON<T>(key: string): T | null {
  const store = localStore();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  const store = localStore();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — session is best-effort */
  }
}

function removeKey(key: string): void {
  const store = localStore();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ── Auth-change subscription ───────────────────────────────────────────────────

type AuthListener = (account: Account | null) => void;
const listeners = new Set<AuthListener>();

/** Subscribe to sign-in / sign-out. Returns an unsubscribe fn. */
export function onAuthChange(cb: AuthListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emitAuthChange(account: Account | null): void {
  for (const cb of listeners) {
    try {
      cb(account);
    } catch {
      /* a listener must not break auth */
    }
  }
}

// ── Session ─────────────────────────────────────────────────────────────────

/** The signed-in account, or null. Synchronous (reads client-side session). */
export function currentUser(): Account | null {
  const acct = readJSON<Account>(SESSION_KEY);
  if (!acct || typeof acct.email !== 'string' || !acct.email) return null;
  return acct;
}

/** True when someone is signed in (has a verified-email session). */
export function isMember(): boolean {
  return currentUser() !== null;
}

/**
 * Open a session for `email` and record the member on the STABLE backend.
 *
 * Fire-and-forget on the network side, so this resolves quickly and never
 * rejects for network reasons. Throws only on an invalid email.
 */
export function signIn(email: string, opts: SignInOptions = {}): Account {
  const clean = normalizeEmail(email);
  const account: Account = {
    email: clean,
    verified: opts.verified ?? false,
    signedInAt: new Date().toISOString(),
    anonymousId: getAnonymousId(),
    displayName: opts.displayName,
  };

  writeJSON(SESSION_KEY, account);
  recordMember(account);
  emitAuthChange(account);
  return account;
}

/** Close the local session. Does not touch the server record. */
export function signOut(): void {
  removeKey(SESSION_KEY);
  track({ event: 'member_signout', eventType: 'custom' });
  emitAuthChange(null);
}

/**
 * Record the member durably on the STABLE Apps Script:
 *  1. A telemetry `member_signin` event (guaranteed-supported sheet), so the
 *     admin Analytics tab sees the login and it stitches to the funnel.
 *  2. A best-effort `type:"member"` row (no-cors) in case the Apps Script keeps
 *     a Members sheet — harmless and ignored if it does not.
 * Both are fire-and-forget; neither can break sign-in.
 */
function recordMember(account: Account): void {
  track({
    event: 'member_signin',
    eventType: 'custom',
    metadata: {
      email: account.email,
      verified: account.verified,
      displayName: account.displayName,
    },
  });

  if (typeof fetch === 'undefined') return;
  const payload = {
    type: 'member',
    storeName: STORE_NAME,
    sessionId: getSessionId(),
    anonymousId: account.anonymousId,
    email: account.email,
    displayName: account.displayName,
    verified: account.verified,
    signedInAt: account.signedInAt,
  };
  try {
    void fetch(ANALYTICS_URL, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    }).catch(() => {
      /* fire-and-forget */
    });
  } catch {
    /* never let member recording break sign-in */
  }
}

// ── Magic-code flow (optional, free, passwordless) ────────────────────────────

interface PendingCode {
  email: string;
  code: string;
  expiresAt: number;
}

function makeCode(): string {
  // 6-digit numeric code.
  if (hasWindow && 'crypto' in window && typeof window.crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return String(100000 + (arr[0] % 900000));
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Email a one-time login code to `email` via the local mail bridge (Email API).
 * The code is held client-side with a 10-minute TTL; delivery to the inbox is
 * what proves control. Returns `{ sent: true }` on success.
 *
 * Rejects if the mail bridge is unreachable (admin app not running) — callers
 * should fall back to lightweight `signIn(email)` in that case.
 */
export async function requestLoginCode(
  email: string,
  opts: { endpoint?: Parameters<typeof sendEmail>[1] } = {},
): Promise<{ sent: boolean; email: string }> {
  const clean = normalizeEmail(email);
  const code = makeCode();
  const pending: PendingCode = { email: clean, code, expiresAt: Date.now() + CODE_TTL_MS };
  writeJSON(CODE_KEY, pending);

  await sendEmail(
    {
      to: clean,
      subject: `Your ${STORE_NAME} sign-in code: ${code}`,
      body:
        `Your ${STORE_NAME} sign-in code is ${code}.\n\n` +
        `Enter it to finish signing in. It expires in 10 minutes.\n\n` +
        `If you didn't request this, you can ignore this email.`,
    },
    opts.endpoint,
  );

  track({ event: 'member_code_requested', eventType: 'custom', metadata: { email: clean } });
  return { sent: true, email: clean };
}

/**
 * Verify a login code and open a `verified: true` session on success.
 * Throws with a friendly message if the code is wrong, expired, or for a
 * different email.
 */
export function verifyLoginCode(email: string, code: string, opts: SignInOptions = {}): Account {
  const clean = normalizeEmail(email);
  const pending = readJSON<PendingCode>(CODE_KEY);
  const given = String(code ?? '').trim();

  if (!pending || pending.email !== clean) {
    throw new Error('No sign-in code was requested for this email. Please request a new one.');
  }
  if (Date.now() > pending.expiresAt) {
    removeKey(CODE_KEY);
    throw new Error('That code has expired. Please request a new one.');
  }
  if (pending.code !== given) {
    throw new Error('That code is not correct. Please check and try again.');
  }

  removeKey(CODE_KEY);
  return signIn(clean, { ...opts, verified: true });
}

// ── Licenses (read the Orders sheet, scoped by email) ─────────────────────────

/** Raw order-ish row shape returned by the Apps Script `licenses` action. */
interface LicenseRow {
  timestamp?: string;
  createdAt?: string;
  date?: string;
  productName?: string;
  productId?: string | number;
  product?: string;
  sku?: string;
  quantity?: number | string;
  notes?: string;
  term?: string;
  orderId?: string;
  clientRef?: string;
  status?: string;
  [k: string]: unknown;
}

function parseRows<T>(text: string): T[] {
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data as T[];
    if (Array.isArray(data?.licenses)) return data.licenses as T[];
    if (Array.isArray(data?.orders)) return data.orders as T[];
    if (Array.isArray(data?.rows)) return data.rows as T[];
    if (Array.isArray(data?.data)) return data.data as T[];
    return [];
  } catch {
    return [];
  }
}

/** Turn free text (product name / notes / term) into a subscription duration. */
function deriveExpiry(purchasedAtMs: number, ...text: (string | undefined)[]): number | undefined {
  const hay = text.filter(Boolean).join(' ').toLowerCase();
  if (!hay) return undefined;
  if (/perpetual|lifetime|forever|one[-\s]?time/.test(hay)) return undefined;

  const YEAR = 365 * 24 * 60 * 60 * 1000;
  const MONTH = 30 * 24 * 60 * 60 * 1000;

  const yr = hay.match(/(\d+)\s*[-\s]?\s*(?:year|yr)/);
  if (yr) return purchasedAtMs + Number(yr[1]) * YEAR;
  const mo = hay.match(/(\d+)\s*[-\s]?\s*month/);
  if (mo) return purchasedAtMs + Number(mo[1]) * MONTH;

  if (/annual|yearly/.test(hay)) return purchasedAtMs + YEAR;
  if (/monthly/.test(hay)) return purchasedAtMs + MONTH;
  if (/subscription/.test(hay)) return purchasedAtMs + YEAR; // default sub term
  return undefined; // no signal → perpetual
}

function parseDate(...candidates: (string | undefined)[]): number {
  for (const c of candidates) {
    if (!c) continue;
    const t = Date.parse(c);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

function toLicense(row: LicenseRow): License {
  const purchasedMs = parseDate(row.createdAt, row.timestamp, row.date);
  const expiresMs = deriveExpiry(purchasedMs, row.term, row.productName, row.product, row.notes);

  let status: LicenseStatus;
  if (expiresMs === undefined) status = 'lifetime';
  else status = expiresMs > Date.now() ? 'active' : 'expired';

  const productId = row.productId != null ? String(row.productId) : undefined;
  return {
    product: String(row.productName || row.product || productId || 'Unknown product'),
    productId,
    sku: row.sku,
    quantity: row.quantity != null ? Number(row.quantity) : undefined,
    purchasedAt: new Date(purchasedMs).toISOString(),
    expiresAt: expiresMs !== undefined ? new Date(expiresMs).toISOString() : undefined,
    status,
    orderRef: row.orderId ?? row.clientRef,
  };
}

/**
 * Read a person's purchase / license history from the Orders sheet, scoped by
 * their (verified) email. Secret-free readable GET against the STABLE Apps
 * Script. Any failure — offline, unimplemented action, bad shape — degrades to
 * an empty list so the page never breaks.
 *
 * @param email  Defaults to the signed-in user's email.
 */
export async function getLicenses(
  email?: string,
  opts: { timeoutMs?: number } = {},
): Promise<License[]> {
  const target = email ?? currentUser()?.email;
  if (!target || !isValidEmail(target)) return [];
  const clean = normalizeEmail(target);

  const qs = new URLSearchParams({ action: 'licenses', email: clean });
  const url = `${ANALYTICS_URL}?${qs.toString()}`;
  const timeoutMs = opts.timeoutMs ?? 8000;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(url, { signal: controller?.signal });
    if (!res.ok) return [];
    const text = await res.text();
    const rows = parseRows<LicenseRow>(text);
    return rows
      .map(toLicense)
      .sort((a, b) => Date.parse(b.purchasedAt) - Date.parse(a.purchasedAt));
  } catch {
    return []; // Orders read must never throw into the UI.
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** True when the email owns at least one non-expired (active/lifetime) license. */
export async function hasActiveLicense(email?: string): Promise<boolean> {
  const licenses = await getLicenses(email);
  return licenses.some((l) => l.status !== 'expired');
}
