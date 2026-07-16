/**
 * Approvals — data layer.
 *
 * Reads the STABLE Orders sheet (via lib/ecommerce) and reconstructs the queue
 * of incoming QUOTE / order REQUESTS that need an admin decision. The SITE
 * captures leads into the Orders sheet with a `source` tag (footer / popup /
 * reseller / quote / savings / callback) plus the visitor's email + notes; those
 * rows — together with anything whose status/notes read like a quote / lead /
 * pending request — are the approval inbox. Completed, paid orders are excluded.
 *
 * Requests are grouped by customer + product (a visitor who submits the same
 * quote form twice is ONE request, latest wins, `captures` counts them).
 *
 * The sheet is READ-ONLY from the admin app, so the human decision layer
 * (approved / rejected, the quoted price, the generated member code, whether the
 * welcome email went out and the member account was created) lives in a local
 * overlay (localStorage) merged on top of the sheet — the two never fight.
 *
 * Data is REAL-only: no rows → empty arrays → the view shows a clean empty
 * state, never a fabricated request.
 */
import { useCallback, useEffect, useState } from "react";
import type { AppConfig } from "@/lib/config";
import { fetchOrders, type Order } from "@/lib/ecommerce";

/* ------------------------------------------------------------------ *
 * Request detection + shaping
 * ------------------------------------------------------------------ */

export type RequestSource =
  | "quote"
  | "reseller"
  | "savings"
  | "callback"
  | "popup"
  | "footer"
  | "lead";

export const SOURCE_LABEL: Record<RequestSource, string> = {
  quote: "Quote request",
  reseller: "Reseller",
  savings: "Savings calc",
  callback: "Callback",
  popup: "Popup lead",
  footer: "Footer lead",
  lead: "Lead",
};

/** How urgent / far-down-funnel this capture reads (used for default sort). */
const SOURCE_WEIGHT: Record<RequestSource, number> = {
  reseller: 6,
  quote: 5,
  callback: 4,
  savings: 3,
  popup: 2,
  footer: 1,
  lead: 1,
};

const SOURCE_MATCHERS: { source: RequestSource; test: RegExp }[] = [
  { source: "reseller", test: /reseller|partner|wholesale|distribut/ },
  { source: "callback", test: /callback|call[-_\s]?back|book[-_\s]?call|schedule[-_\s]?call|request[-_\s]?call/ },
  { source: "savings", test: /savings|see[-_\s]?my[-_\s]?savings|roi|calculator/ },
  { source: "quote", test: /quote|instant[-_\s]?quote|get[-_\s]?my[-_\s]?quote|proposal|pricing/ },
  { source: "popup", test: /popup|pop[-_\s]?up|modal/ },
  { source: "footer", test: /footer|newsletter|subscribe/ },
];

/** Keywords in status/notes that mark a row as an unresolved REQUEST. */
const REQUEST_HINT =
  /quote|lead|pending|request|enquir|inquir|reseller|callback|savings|footer|popup|new|proposal|interested|await/i;

/** Keywords that mean the order is already DONE — never an approval request. */
const DONE_HINT = /paid|complete|fulfilled|delivered|shipped|refund|cancel|won|closed|member/i;

/** Site marker: the quote was auto-approved + emailed while the VPS/AI was down. */
const AUTO_APPROVED_HINT = /auto[-_\s]?approved/i;

/** True when the site auto-approved this request (sent the quote + email offline). */
export function isAutoApproved(o: Order): boolean {
  return AUTO_APPROVED_HINT.test(`${str(o, "status")} ${o.notes ?? ""} ${rawSource(o)}`);
}

function bag(o: Order): Record<string, unknown> {
  return o as unknown as Record<string, unknown>;
}

function str(o: Order, ...keys: string[]): string {
  const b = bag(o);
  for (const k of keys) {
    const v = b[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** The raw source tag the site stamped on the row, if any. */
function rawSource(o: Order): string {
  return str(o, "source", "lead_source", "leadSource", "form", "formName", "channel", "campaign", "tag");
}

/** Classify a row's source; null-safe. */
export function sourceOf(o: Order): RequestSource {
  const hay = `${rawSource(o)} ${o.status ?? ""} ${o.notes ?? ""} ${str(o, "form", "kind", "type")}`.toLowerCase();
  for (const m of SOURCE_MATCHERS) if (m.test.test(hay)) return m.source;
  return "lead";
}

/**
 * Is this Orders row an approval REQUEST (a quote/lead/pending capture that
 * needs an admin decision) rather than a completed sale?
 */
export function isRequest(o: Order): boolean {
  const hasContact = !!(o.email || o.customerName || o.phone);
  if (!hasContact) return false;
  // Auto-approved quotes are still shown in the queue (as a record), even though
  // their notes contain "approved" (which DONE_HINT would otherwise exclude).
  if (isAutoApproved(o)) return true;
  const status = String(o.status ?? "");
  const notes = String(o.notes ?? "");
  const src = rawSource(o);
  const hay = `${src} ${status} ${notes}`;
  if (DONE_HINT.test(hay)) return false;
  // A positive request signal: a lead source tag, or request-ish status/notes.
  if (src) return true;
  if (REQUEST_HINT.test(hay)) return true;
  // A row with contact + no price / zero price and no "done" marker is an open
  // request (someone asking for a quote before a price exists).
  const price = parseFloat(String(o.price ?? "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(price) || price <= 0) return true;
  return false;
}

export interface ApprovalRequest {
  /** Stable id: lowercased email (or name) + product. */
  id: string;
  capturedAt: string;
  ts: number;
  source: RequestSource;
  customerName: string;
  email: string;
  phone: string;
  company: string;
  location: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  /** Any price the site already carried (the visitor's ask / list price). */
  requestedPrice: number;
  currency: string;
  /** Free-text need / message the capture carried. */
  details: string;
  budget?: number;
  seats?: number;
  /** How many times this person submitted for this product. */
  captures: number;
  /** Site auto-approved this while the VPS/AI was down (quote + email already sent). */
  autoApproved: boolean;
  raw: Order[];
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function optNum(o: Order, ...keys: string[]): number | undefined {
  const b = bag(o);
  for (const k of keys) {
    const v = b[k];
    if (v == null || v === "") continue;
    const n = num(v);
    if (n) return n;
  }
  return undefined;
}

function requestKey(o: Order): string {
  const who = String(o.email ?? "").trim().toLowerCase() || `name:${String(o.customerName ?? "").trim().toLowerCase()}`;
  const prod = String(o.productId ?? o.sku ?? o.productName ?? "any").trim().toLowerCase();
  return `${who}|${prod}` || "unknown";
}

function fromOrder(o: Order): ApprovalRequest {
  const ts = Date.parse(String(o.timestamp ?? "")) || 0;
  return {
    id: requestKey(o),
    capturedAt: String(o.timestamp ?? ""),
    ts,
    source: sourceOf(o),
    customerName: String(o.customerName ?? ""),
    email: String(o.email ?? "").trim().toLowerCase(),
    phone: String(o.phone ?? ""),
    company: str(o, "company", "organisation", "organization", "business"),
    location: [o.city, o.state, o.country].filter(Boolean).join(", "),
    productId: String(o.productId ?? ""),
    productName: String(o.productName ?? o.sku ?? "General enquiry"),
    sku: String(o.sku ?? ""),
    quantity: Math.max(1, num(o.quantity) || 1),
    requestedPrice: num(o.price) * Math.max(1, num(o.quantity) || 1),
    currency: String(o.currency ?? "USD") || "USD",
    details: str(o, "notes", "message", "need", "intent", "summary", "description", "query"),
    budget: optNum(o, "budget", "value"),
    seats: optNum(o, "seats", "teamSize", "team", "users"),
    captures: 1,
    autoApproved: isAutoApproved(o),
    raw: [o],
  };
}

/** Build the deduped request queue from the Orders sheet, newest first. */
export function deriveRequests(orders: Order[]): ApprovalRequest[] {
  const byKey = new Map<string, ApprovalRequest>();
  for (const o of orders) {
    if (!isRequest(o)) continue;
    const r = fromOrder(o);
    const existing = byKey.get(r.id);
    if (!existing) {
      byKey.set(r.id, r);
      continue;
    }
    existing.captures += 1;
    existing.raw.push(o);
    existing.autoApproved = existing.autoApproved || r.autoApproved;
    // Latest capture wins for the headline fields; back-fill any blanks.
    if (r.ts >= existing.ts) {
      byKey.set(r.id, {
        ...existing,
        ...r,
        captures: existing.captures,
        autoApproved: existing.autoApproved,
        raw: existing.raw,
        details: r.details || existing.details,
        phone: r.phone || existing.phone,
        company: r.company || existing.company,
        requestedPrice: r.requestedPrice || existing.requestedPrice,
      });
    } else {
      existing.details ||= r.details;
      existing.phone ||= r.phone;
      existing.company ||= r.company;
      existing.requestedPrice ||= r.requestedPrice;
    }
  }
  return [...byKey.values()].sort(
    (a, b) => SOURCE_WEIGHT[b.source] - SOURCE_WEIGHT[a.source] || b.ts - a.ts,
  );
}

/* ------------------------------------------------------------------ *
 * Local decision overlay (approved / rejected + quote + member)
 * ------------------------------------------------------------------ */

export type DecisionState = "pending" | "approved" | "rejected" | "auto_approved";

export interface Decision {
  state: DecisionState;
  /** The price the admin set for the quote (per-order total). */
  quotedPrice?: number;
  currency?: string;
  /** Generated Exclusive Member credentials issued on approval. */
  memberCode?: string;
  memberPassword?: string;
  loginUrl?: string;
  approvedAt?: number;
  rejectedAt?: number;
  rejectReason?: string;
  /** Fulfilment flags for the approve flow. */
  accountCreated?: boolean;
  emailSent?: boolean;
  updatedAt: number;
}

const LS_KEY = "dsm-admin.approvals";
type Overlay = Record<string, Decision>;
type Listener = (o: Overlay) => void;
const listeners = new Set<Listener>();

function read(): Overlay {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Overlay;
  } catch {
    /* fall through */
  }
  return {};
}

function write(o: Overlay) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(o));
  } catch {
    /* ignore quota */
  }
  listeners.forEach((l) => l(o));
}

export function subscribeDecisions(fn: Listener): () => void {
  listeners.add(fn);
  fn(read());
  return () => {
    listeners.delete(fn);
  };
}

export function getDecision(id: string): Decision {
  return read()[id] ?? { state: "pending", updatedAt: 0 };
}

export function setDecision(id: string, patch: Partial<Decision>): Decision {
  const o = read();
  const next: Decision = { ...(o[id] ?? { state: "pending", updatedAt: 0 }), ...patch, updatedAt: Date.now() };
  o[id] = next;
  write(o);
  return next;
}

export function resetDecision(id: string) {
  const o = read();
  delete o[id];
  write(o);
}

/* ------------------------------------------------------------------ *
 * Member credential generation (deterministic-random, local)
 * ------------------------------------------------------------------ */

const MEMBER_LOGIN_BASE = "https://dsmsolutions.com.au/members/login";

function randChunk(len: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export interface MemberCreds {
  memberCode: string;
  memberPassword: string;
  loginUrl: string;
}

/** Issue a fresh Exclusive Member code + temp password + prefilled login link. */
export function issueMemberCreds(email: string): MemberCreds {
  const memberCode = `DSM-${randChunk(4)}-${randChunk(4)}`;
  const memberPassword = `${randChunk(4)}-${randChunk(4)}`;
  const url = new URL(MEMBER_LOGIN_BASE);
  url.searchParams.set("code", memberCode);
  if (email) url.searchParams.set("email", email);
  return { memberCode, memberPassword, loginUrl: url.toString() };
}

/* ------------------------------------------------------------------ *
 * Combined view model + stats
 * ------------------------------------------------------------------ */

export interface ApprovalItem extends ApprovalRequest {
  decision: Decision;
}

export interface ApprovalStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  auto_approved: number;
}

export function mergeDecisions(requests: ApprovalRequest[], overlay: Overlay): ApprovalItem[] {
  return requests.map((r) => {
    // A local admin decision always wins. Otherwise, a site auto-approved quote
    // shows as "auto_approved" (already sent); everything else is pending.
    const decision: Decision =
      overlay[r.id] ??
      (r.autoApproved
        ? { state: "auto_approved", updatedAt: 0, emailSent: true }
        : { state: "pending", updatedAt: 0 });
    return { ...r, decision };
  });
}

export function statsOf(items: ApprovalItem[]): ApprovalStats {
  const s: ApprovalStats = { total: items.length, pending: 0, approved: 0, rejected: 0, auto_approved: 0 };
  for (const it of items) s[it.decision.state]++;
  return s;
}

/* ------------------------------------------------------------------ *
 * Data hook
 * ------------------------------------------------------------------ */

export interface ApprovalsData {
  items: ApprovalItem[];
  stats: ApprovalStats;
  loading: boolean;
  error: string | null;
  /** Sheet returned zero request rows (clean empty state, not an error). */
  isEmpty: boolean;
  reload: () => void;
}

export function useApprovalsData(config: AppConfig): ApprovalsData {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [overlay, setOverlay] = useState<Overlay>(() => read());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchOrders(config)
      .then((orders) => {
        if (!alive) return;
        setRequests(deriveRequests(orders));
        setLoaded(true);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoaded(true);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [config]);

  useEffect(() => reload(), [reload]);
  useEffect(() => subscribeDecisions(setOverlay), []);

  const items = mergeDecisions(requests, overlay);
  return {
    items,
    stats: statsOf(items),
    loading,
    error,
    isEmpty: loaded && !error && requests.length === 0,
    reload,
  };
}
