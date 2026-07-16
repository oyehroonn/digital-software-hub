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

// ── Email + password (simple accounts via the ecommerce Apps Script) ──────────
//
// A plain-store login: the Apps Script keeps an "Accounts" tab (email + a
// low-value password) and answers `GET ?action=login&email=&password=`. Not a
// security boundary — it just lets returning buyers keep a named account.

/**
 * Create an account (email + password) and open a session. Optimistic: the
 * create is a fire-and-forget POST (the Apps Script never overwrites an existing
 * password, so this can't hijack an existing account). Throws only on invalid
 * input.
 */
export async function signUp(
  email: string,
  password: string,
  opts: { displayName?: string } = {},
): Promise<Account> {
  const clean = normalizeEmail(email);
  if (!password || password.length < 4) {
    throw new Error('Please choose a password of at least 4 characters.');
  }
  if (typeof fetch !== 'undefined') {
    const payload = {
      type: 'account_create',
      storeName: STORE_NAME,
      email: clean,
      password,
      displayName: opts.displayName,
      sessionId: getSessionId(),
      anonymousId: getAnonymousId(),
    };
    try {
      // AWAIT the account write (not fire-and-forget): the caller navigates to
      // the account page right after sign-up, which would otherwise abort the
      // in-flight request and lose the account. no-cors → opaque response, but
      // awaiting still guarantees the POST completed before we move on.
      await fetch(ANALYTICS_URL, {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
    } catch {
      /* network down — the session still opens optimistically below */
    }
  }
  track({ event: 'member_signup', eventType: 'custom', metadata: { email: clean } });
  return signIn(clean, { displayName: opts.displayName });
}

/**
 * Sign in by checking email + password against the Apps Script. Opens a session
 * on success. Throws a friendly message on a wrong password / unknown email /
 * unreachable server.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<Account> {
  const clean = normalizeEmail(email);
  const qs = new URLSearchParams({ action: 'login', email: clean, password });
  const url = `${ANALYTICS_URL}?${qs.toString()}`;

  let data: { ok?: boolean; error?: string; account?: { displayName?: string; verified?: boolean } } | null =
    null;
  try {
    const res = await fetch(url);
    if (res.ok) data = await res.json();
  } catch {
    throw new Error('Could not reach the server. Please check your connection and try again.');
  }

  if (!data || !data.ok) {
    if (data && data.error === 'no_account') {
      throw new Error('No account found for that email — create one first.');
    }
    throw new Error('Wrong email or password.');
  }
  return signIn(clean, {
    displayName: data.account?.displayName,
    verified: Boolean(data.account?.verified),
  });
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

/**
 * Licenses that carry a real expiry and fall due within `withinDays`. Lifetime
 * and already-expired licenses are excluded. Sorted soonest-first — this is the
 * exact set the renewal-reminder cron and the portal "expiring soon" strip use.
 */
export async function getExpiringLicenses(
  withinDays = 30,
  email?: string,
): Promise<License[]> {
  const licenses = await getLicenses(email);
  const now = Date.now();
  const horizon = now + withinDays * 24 * 60 * 60 * 1000;
  return licenses
    .filter((l) => {
      if (!l.expiresAt) return false; // lifetime — never "expiring"
      const t = Date.parse(l.expiresAt);
      return !Number.isNaN(t) && t > now && t <= horizon;
    })
    .sort((a, b) => Date.parse(a.expiresAt!) - Date.parse(b.expiresAt!));
}

/** Whole days until an ISO expiry (negative if already lapsed). */
export function daysUntil(expiresAt?: string): number | undefined {
  if (!expiresAt) return undefined;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return undefined;
  return Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
}

// ── Member perks: insider opt-in ──────────────────────────────────────────────
//
// "Insiders" get new-launch alerts + renewal reminders by email. The opt-in is a
// free, reversible preference. It is held client-side (so the UI is instant and
// works with the STABLE backend only) AND mirrored to the Apps Script as a
// telemetry event + a best-effort `type:"member"` row, so the server-side email
// cron can read who to email from the same sheet the admin app reads.

const INSIDER_KEY = 'dsm.account.insider';

/** Is the given email (default: signed-in user) opted into insider emails? */
export function isInsider(email?: string): boolean {
  const target = (email ?? currentUser()?.email ?? '').trim().toLowerCase();
  if (!target) return false;
  const map = readJSON<Record<string, boolean>>(INSIDER_KEY) ?? {};
  return map[target] === true;
}

/**
 * Opt the member in/out of insider emails (new-launch alerts + renewal
 * reminders). Records the preference durably on the STABLE Apps Script so the
 * email cron can honour it. Fire-and-forget on the network; never throws for
 * network reasons. Requires a signed-in user (or an explicit email).
 */
export function setInsiderOptIn(optIn: boolean, email?: string): void {
  const target = email ?? currentUser()?.email;
  if (!target || !isValidEmail(target)) return;
  const clean = normalizeEmail(target);

  const map = readJSON<Record<string, boolean>>(INSIDER_KEY) ?? {};
  map[clean] = optIn;
  writeJSON(INSIDER_KEY, map);

  track({
    event: optIn ? 'member_insider_optin' : 'member_insider_optout',
    eventType: 'custom',
    metadata: { email: clean, insider: optIn },
  });

  if (typeof fetch === 'undefined') return;
  const payload = {
    type: 'member',
    storeName: STORE_NAME,
    sessionId: getSessionId(),
    anonymousId: getAnonymousId(),
    email: clean,
    insider: optIn,
    updatedAt: new Date().toISOString(),
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
    /* never break the toggle */
  }
}

// ── Member perks: member pricing ──────────────────────────────────────────────
//
// Every signed-in member gets a standing discount. Pricing is presentational
// only — the authoritative price is still what the order carries — so this is a
// pure, side-effect-free helper the storefront can call to show member savings.

/** Standing member discount, as a percentage. Overridable via env. */
export const MEMBER_DISCOUNT_PCT: number = (() => {
  const raw = Number(import.meta.env.VITE_MEMBER_DISCOUNT_PCT);
  return Number.isFinite(raw) && raw > 0 && raw < 90 ? raw : 10;
})();

export interface MemberPrice {
  /** Parsed original price. */
  original: number;
  /** Discounted price. */
  member: number;
  /** Absolute amount saved. */
  saved: number;
  /** Currency symbol/prefix detected on the input (e.g. "$", "AED "). */
  currency: string;
  /** Pre-formatted member price string, e.g. "$116.10". */
  formatted: string;
}

/**
 * Compute the member price for a display price string (e.g. "$129.00", "AED 499",
 * "129"). Returns `null` when no numeric price can be read (e.g. "Contact us"),
 * so callers can simply skip the member badge in that case.
 */
export function memberPrice(
  priceText: string | number | undefined,
  pct: number = MEMBER_DISCOUNT_PCT,
): MemberPrice | null {
  if (priceText == null) return null;
  const text = String(priceText);
  const match = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const original = Number.parseFloat(match[1]);
  if (!Number.isFinite(original) || original <= 0) return null;

  const currency = text.slice(0, text.indexOf(match[1])).trim();
  const prefix = currency ? (currency.length > 1 ? `${currency} ` : currency) : '';
  const member = Math.round(original * (1 - pct / 100) * 100) / 100;
  const saved = Math.round((original - member) * 100) / 100;
  const formatted = `${prefix}${member.toFixed(2)}`;
  return { original, member, saved, currency: prefix, formatted };
}
