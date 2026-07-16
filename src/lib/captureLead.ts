/**
 * captureLead — universal email/lead capture to the STABLE Ecommerce Apps Script.
 * ------------------------------------------------------------------------------
 * EVERY place a visitor gives us an email should ALSO fire this, in addition to
 * whatever the form already does. It writes a lightweight `type:"order"` lead
 * record into the same Orders sheet the admin app reads, so every email address
 * a visitor submits — newsletter, account sign-in, reseller registration, quote,
 * savings estimate, callback booking — surfaces in the admin Customers view,
 * tagged with WHERE it came from (`source`).
 *
 * Contract (matches the STABLE backend rules used by lib/stable/*):
 *  - Fire-and-forget `mode:"no-cors"`, `keepalive`, `text/plain` body. It never
 *    awaits, never throws into the page, and never blocks the form it rides on.
 *  - No secret is ever sent from the browser (the Orders sheet accepts anonymous
 *    lead POSTs, same as telemetry / order submission).
 *  - The record is wrapped in the SAME envelope shape as a real order
 *    (`{type:"order", clientRef, sessionId, anonymousId, order:{…}}`) so it lands
 *    consistently alongside orders for the admin Customers/Orders view, with a
 *    `source` tag on both the envelope and the order for easy filtering.
 *  - De-duplicated per (email × source) within the tab so re-renders / retries
 *    don't spam the sheet with the same lead.
 *
 * This is a capture SIDE-CHANNEL. It deliberately does NOT replace richer order
 * submission (submitOrder) or email delivery where those already run — it just
 * guarantees the raw email lands as a customer/lead no matter what.
 */

import {
  ANALYTICS_URL,
  STORE_NAME,
  getSessionId,
  getAnonymousId,
} from './stable/analytics';

/** Where the lead was captured — tags the record for the admin Customers view. */
export type LeadSource =
  | 'newsletter'
  | 'account'
  | 'reseller'
  | 'quote'
  | 'savings'
  | 'callback'
  // Allow ad-hoc sources without losing autocomplete on the known ones.
  | (string & {});

export interface CaptureLeadInput {
  /** The visitor's email. Invalid / empty emails are silently ignored. */
  email: string;
  /** Where this lead came from (footer newsletter, reseller modal, …). */
  source: LeadSource;
  /** Optional display name; falls back to the email's local part. */
  name?: string;
  /** Optional phone number. */
  phone?: string;
  /** Optional company / organisation. */
  company?: string;
  /** Free-text note (what they asked for, plan details, etc.). */
  notes?: string;
  /**
   * Optional label shown in the Orders "product" column. Defaults to a
   * readable source label, e.g. "Lead — Newsletter".
   */
  productName?: string;
  /** Extra structured context, serialised into the notes for the admin. */
  metadata?: Record<string, unknown>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Per-tab de-dupe so the same email+source isn't re-sent on every keystroke,
// re-render, or retry. Best-effort only; a page reload starts fresh (fine).
const sent = new Set<string>();

function makeRef(): string {
  if (
    typeof crypto !== 'undefined' &&
    'randomUUID' in crypto &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `lead_${crypto.randomUUID()}`;
  }
  return `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sourceLabel(source: string): string {
  return source
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

/**
 * Fire-and-forget a captured email as a lead/customer record into the Ecommerce
 * Apps Script Orders sheet. Safe to call from anywhere; never throws.
 */
export function captureLead(input: CaptureLeadInput): void {
  if (typeof fetch === 'undefined') return;

  const email = (input.email ?? '').trim();
  if (!EMAIL_RE.test(email)) return;

  const source = (input.source || 'site').trim() || 'site';
  const dedupeKey = `${email.toLowerCase()}::${source}`;
  if (sent.has(dedupeKey)) return;
  sent.add(dedupeKey);

  const notes = [
    `Lead source: ${source}`,
    input.company ? `Company: ${input.company.trim()}` : '',
    input.notes?.trim() || '',
    input.metadata && Object.keys(input.metadata).length
      ? `Context: ${safeJson(input.metadata)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const order = {
    storeName: STORE_NAME,
    customerName: input.name?.trim() || email.split('@')[0] || 'Website visitor',
    email,
    phone: input.phone?.trim() || undefined,
    company: input.company?.trim() || undefined,
    productId: `lead-${source}`,
    productName: input.productName?.trim() || `Lead — ${sourceLabel(source)}`,
    quantity: 1,
    price: 'Lead',
    notes,
    // Redundant top-level tag so the admin can filter/group by capture point
    // regardless of which field it reads.
    source,
    leadType: 'lead' as const,
  };

  const envelope = {
    type: 'order' as const,
    clientRef: makeRef(),
    sessionId: getSessionId(),
    anonymousId: getAnonymousId(),
    // Tag the envelope too — belt and braces for the admin Customers view.
    source,
    lead: true,
    order,
  };

  try {
    void fetch(ANALYTICS_URL, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      // Send the order fields at the TOP LEVEL too (not only nested under
      // `order`), because the Apps Script `appendOrder_` reads top-level keys
      // (email / customerName / productName / price / notes). Without this the
      // lead lands as a blank row. The nested `order` stays for raw_json.
      body: JSON.stringify({ ...envelope, ...order }),
    }).catch(() => {
      /* fire-and-forget: swallow all network errors */
    });
  } catch {
    /* never let lead capture break the page */
  }
}

export default captureLead;
