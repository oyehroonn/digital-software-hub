/**
 * CRM / Leads data layer for the DSM admin app.
 *
 * Two source-of-truth feeds, both already available to the app:
 *   1. Telemetry (STABLE Apps Script, via telemetryClient) — every quote /
 *      savings / beta / callback / bulk-quote capture the site fires lands here
 *      as an event carrying the visitor's details in `metadata`. We reconstruct
 *      LEADS from those events.
 *   2. Orders (STABLE Apps Script, via ecommerce.fetchOrders) — the purchase /
 *      license history. Grouped by email these become CUSTOMERS, and each order
 *      line becomes a LICENSE with a derived term + expiry.
 *
 * Everything here is PURE and defensive: naming drift never throws. Data is
 * REAL-only — leads are derived from live telemetry captures; when none exist
 * the CRM views render a clean empty state (never fabricated leads).
 */
import type { TelemetryEvent } from "@/analytics/telemetryClient";
import type { Order } from "@/lib/ecommerce";

/* ────────────────────────────────────────────────────────────────────────── *
 *  Leads
 * ────────────────────────────────────────────────────────────────────────── */

export type LeadSource =
  | "quote"
  | "savings"
  | "beta"
  | "callback"
  | "bulk-quote"
  | "upgrade"
  | "contact";

export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";

export interface Lead {
  /** Stable id (email+source when possible, else session/anon based). */
  id: string;
  capturedAt: string;
  ts: number;
  source: LeadSource;
  name: string;
  email: string;
  phone: string;
  company: string;
  /** Free-text need / summary the capture carried. */
  intent: string;
  productInterest: string;
  budget?: number;
  teamSize?: number;
  currentSpend?: number;
  estSavings?: number;
  sessionId: string;
  anonymousId: string;
  pageUrl: string;
  /** How many times this person submitted this kind of capture. */
  captures: number;
  metadata: Record<string, unknown>;
  _seed?: boolean;
}

const SOURCE_MATCHERS: { source: LeadSource; test: RegExp }[] = [
  { source: "bulk-quote", test: /bulk_?quote|build_?my_?order|team_?quote|b2b/ },
  { source: "callback", test: /callback|book_?call|schedule_?call|smart_?callback|request_?call/ },
  { source: "savings", test: /savings|see_?my_?savings|roi|calculator/ },
  { source: "beta", test: /beta|early_?access|waitlist|sign_?up|signup/ },
  { source: "upgrade", test: /upgrade|renew|renewal/ },
  { source: "quote", test: /quote|instant_?quote|quote_?genie|get_?my_?quote/ },
  { source: "contact", test: /contact|lead|enquiry|inquiry|get_?in_?touch|demo/ },
];

export const SOURCE_LABEL: Record<LeadSource, string> = {
  quote: "Instant Quote",
  savings: "Savings Calc",
  beta: "Beta / Waitlist",
  callback: "Callback",
  "bulk-quote": "Bulk Quote (B2B)",
  upgrade: "Upgrade / Renewal",
  contact: "Contact / Demo",
};

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

function meta(e: TelemetryEvent): Record<string, unknown> {
  return e.metadata && typeof e.metadata === "object" ? (e.metadata as Record<string, unknown>) : {};
}

function mstr(m: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = m[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function mnum(m: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = m[k];
    if (v == null || v === "") continue;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Classify a telemetry event as a lead-capture (returns its source) or null. */
export function leadSourceOf(e: TelemetryEvent): LeadSource | null {
  const m = meta(e);
  const hasContact =
    !!mstr(m, "email", "customerEmail", "user_email") ||
    !!mstr(m, "phone", "tel", "mobile") ||
    !!mstr(m, "name", "customerName", "fullName");
  const type = String(e.eventType ?? "").toLowerCase();
  const name = String(e.event ?? "").toLowerCase();
  const looksLikeForm =
    hasContact || /form|submit|lead|capture|request/.test(type) || /submit|capture|request/.test(name);
  if (!looksLikeForm) return null;
  const hay = `${name} ${type} ${e.elementId ?? ""} ${e.elementText ?? ""} ${mstr(m, "feature", "form", "source", "kind")}`.toLowerCase();
  for (const s of SOURCE_MATCHERS) if (s.test.test(hay)) return s.source;
  // A form-shaped event carrying contact info but no obvious tag → generic contact.
  return hasContact ? "contact" : null;
}

function leadFromEvent(e: TelemetryEvent, source: LeadSource): Lead {
  const m = meta(e);
  const email = (mstr(m, "email", "customerEmail", "user_email").match(EMAIL_RE)?.[0] ?? "").toLowerCase();
  const name = mstr(m, "name", "customerName", "fullName", "contact");
  const anonymousId = String(e.anonymousId ?? "");
  const sessionId = String(e.sessionId ?? "");
  const key = email || anonymousId || sessionId || String(e.ts ?? Math.random());
  return {
    id: `${source}:${key}`,
    capturedAt: String(e.timestamp ?? ""),
    ts: typeof e.ts === "number" && e.ts > 0 ? e.ts : Date.parse(String(e.timestamp ?? "")) || 0,
    source,
    name,
    email,
    phone: mstr(m, "phone", "tel", "mobile"),
    company: mstr(m, "company", "organisation", "organization", "business", "teamName"),
    intent: mstr(m, "message", "need", "intent", "summary", "notes", "description", "query"),
    productInterest: mstr(m, "productName", "product", "productId", "interest") || String(e.productId ?? ""),
    budget: mnum(m, "budget", "value"),
    teamSize: mnum(m, "teamSize", "seats", "team", "users", "quantity"),
    currentSpend: mnum(m, "currentSpend", "spend", "monthlySpend"),
    estSavings: mnum(m, "estSavings", "savings", "estimatedSavings"),
    sessionId,
    anonymousId,
    pageUrl: String(e.pageUrl ?? ""),
    captures: 1,
    metadata: m,
    _seed: e._seed === true ? true : undefined,
  };
}

/**
 * Reconstruct the lead inbox from telemetry. Multiple captures from the same
 * person+source collapse into one lead (latest wins; `captures` counts them),
 * so a visitor who resubmits a quote form is one row, not five.
 */
export function deriveLeads(events: TelemetryEvent[]): Lead[] {
  const byKey = new Map<string, Lead>();
  for (const e of events) {
    const src = leadSourceOf(e);
    if (!src) continue;
    const lead = leadFromEvent(e, src);
    const existing = byKey.get(lead.id);
    if (!existing) {
      byKey.set(lead.id, lead);
    } else {
      existing.captures += 1;
      // keep the most recent capture's details, merge in any newly-filled fields
      if (lead.ts >= existing.ts) {
        byKey.set(lead.id, {
          ...existing,
          ...lead,
          captures: existing.captures,
          name: lead.name || existing.name,
          phone: lead.phone || existing.phone,
          company: lead.company || existing.company,
          intent: lead.intent || existing.intent,
        });
      } else {
        existing.name ||= lead.name;
        existing.phone ||= lead.phone;
        existing.company ||= lead.company;
        existing.intent ||= lead.intent;
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.ts - a.ts);
}

/** Stable contact key used to attach tags/notes/status/tasks in the local store. */
export function contactKey(x: { email?: string; id?: string }): string {
  const email = (x.email ?? "").trim().toLowerCase();
  if (email) return email;
  return x.id ? `id:${x.id}` : "unknown";
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Behaviour index (telemetry) — feeds lead scoring
 * ────────────────────────────────────────────────────────────────────────── */

export interface Behavior {
  pageviews: number;
  productViews: number;
  clicks: number;
  addToCarts: number;
  checkouts: number;
  orders: number;
  sessions: number;
  /** Deepest funnel stage reached, 0 (view) … 4 (order). -1 if none. */
  reachedStage: number;
  firstSeen: number;
  lastSeen: number;
  products: string[];
}

const STAGE_TESTS: ((n: string) => boolean)[] = [
  (n) => /page_?view|visit|session_?start/.test(n),
  (n) => /product_?view|view_?product|pdp/.test(n),
  (n) => /add_?to_?cart|cart_?add/.test(n),
  (n) => /checkout|begin_?checkout/.test(n),
  (n) => /^order$|purchase|order_?placed|order_?created/.test(n),
];

function emptyBehavior(): Behavior {
  return {
    pageviews: 0,
    productViews: 0,
    clicks: 0,
    addToCarts: 0,
    checkouts: 0,
    orders: 0,
    sessions: 0,
    reachedStage: -1,
    firstSeen: 0,
    lastSeen: 0,
    products: [],
  };
}

/**
 * Build a behaviour profile per visitor keyed by BOTH anonymousId and sessionId
 * (the same profile object is registered under every id it owns), so a lead can
 * be joined by whichever identifier its capture carried.
 */
export function buildBehaviorIndex(events: TelemetryEvent[]): Map<string, Behavior> {
  const byAnon = new Map<string, Behavior>();
  const sessionsByAnon = new Map<string, Set<string>>();
  const productsByAnon = new Map<string, Set<string>>();

  const anonOf = (e: TelemetryEvent) =>
    String(e.anonymousId ?? "") || String(e.sessionId ?? "") || "";

  for (const e of events) {
    const anon = anonOf(e);
    if (!anon) continue;
    let b = byAnon.get(anon);
    if (!b) {
      byAnon.set(anon, (b = emptyBehavior()));
      sessionsByAnon.set(anon, new Set());
      productsByAnon.set(anon, new Set());
    }
    const ts = typeof e.ts === "number" && e.ts > 0 ? e.ts : Date.parse(String(e.timestamp ?? "")) || 0;
    if (ts) {
      b.firstSeen = b.firstSeen ? Math.min(b.firstSeen, ts) : ts;
      b.lastSeen = Math.max(b.lastSeen, ts);
    }
    if (e.sessionId) sessionsByAnon.get(anon)!.add(String(e.sessionId));
    if (e.productId) productsByAnon.get(anon)!.add(String(e.productId));

    const name = String(e.event ?? e.eventType ?? "").toLowerCase();
    const type = String(e.eventType ?? "").toLowerCase();
    if (STAGE_TESTS[0](name)) b.pageviews++;
    if (STAGE_TESTS[1](name)) b.productViews++;
    if (STAGE_TESTS[2](name)) b.addToCarts++;
    if (STAGE_TESTS[3](name)) b.checkouts++;
    if (STAGE_TESTS[4](name)) b.orders++;
    if (type === "click" || /click|tap|press/.test(name)) b.clicks++;
    for (let s = STAGE_TESTS.length - 1; s >= 0; s--) {
      if (STAGE_TESTS[s](name)) {
        if (s > b.reachedStage) b.reachedStage = s;
        break;
      }
    }
  }

  for (const [anon, b] of byAnon) {
    b.sessions = sessionsByAnon.get(anon)?.size ?? 0;
    b.products = [...(productsByAnon.get(anon) ?? [])];
  }

  // Register each profile under every id (anon + its sessions) for easy joins.
  const index = new Map<string, Behavior>();
  for (const [anon, b] of byAnon) {
    index.set(anon, b);
    for (const sid of sessionsByAnon.get(anon) ?? []) index.set(sid, b);
  }
  return index;
}

export function behaviorForLead(lead: Lead, index: Map<string, Behavior>): Behavior | undefined {
  return (
    (lead.anonymousId && index.get(lead.anonymousId)) ||
    (lead.sessionId && index.get(lead.sessionId)) ||
    undefined
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Lead scoring — form intent + telemetry behaviour
 * ────────────────────────────────────────────────────────────────────────── */

export type Grade = "A" | "B" | "C" | "D";

export interface LeadScore {
  score: number; // 0..100
  grade: Grade;
  intentPoints: number; // 0..55
  behaviorPoints: number; // 0..45
  reasons: { label: string; points: number }[];
}

/** Source intent weight (0..1) — how far down the funnel this capture implies. */
const SOURCE_INTENT: Record<LeadSource, number> = {
  "bulk-quote": 1,
  callback: 0.95,
  upgrade: 0.85,
  quote: 0.8,
  contact: 0.55,
  savings: 0.5,
  beta: 0.35,
};

export function scoreLead(lead: Lead, behavior?: Behavior): LeadScore {
  const reasons: { label: string; points: number }[] = [];
  const add = (label: string, points: number) => {
    if (points > 0) reasons.push({ label, points: Math.round(points) });
    return points;
  };

  // ── Form intent (max ~55) ──────────────────────────────────────────────
  let intent = 0;
  intent += add(`${SOURCE_LABEL[lead.source]} form`, SOURCE_INTENT[lead.source] * 22);
  if (lead.email) intent += add("Left an email", 6);
  if (lead.phone) intent += add("Left a phone number", 6);
  if (lead.company) intent += add("Named their company", 4);
  if (lead.intent && lead.intent.length > 12) intent += add("Described their need", 4);
  if (lead.budget && lead.budget > 0) {
    intent += add(lead.budget >= 5000 ? "High stated budget" : "Stated a budget", lead.budget >= 5000 ? 8 : 4);
  }
  if (lead.teamSize && lead.teamSize > 1) {
    intent += add(lead.teamSize >= 10 ? "Large team (10+ seats)" : "Multi-seat need", lead.teamSize >= 10 ? 7 : 4);
  }
  if (lead.captures > 1) intent += add(`Submitted ${lead.captures}× (repeat intent)`, Math.min(6, lead.captures * 2));
  intent = Math.min(55, intent);

  // ── Telemetry behaviour (max ~45) ──────────────────────────────────────
  let behav = 0;
  if (behavior) {
    if (behavior.productViews > 0)
      behav += add(`${behavior.productViews} product view${behavior.productViews > 1 ? "s" : ""}`, Math.min(10, behavior.productViews * 3));
    if (behavior.addToCarts > 0) behav += add("Added to cart", 10);
    if (behavior.checkouts > 0) behav += add("Reached checkout", 9);
    if (behavior.orders > 0) behav += add("Already purchased", 8);
    if (behavior.sessions > 1)
      behav += add(`${behavior.sessions} sessions (return visitor)`, Math.min(6, behavior.sessions * 2));
    const days = behavior.lastSeen ? (Date.now() - behavior.lastSeen) / 86_400_000 : Infinity;
    if (days <= 3) behav += add("Active in last 3 days", 6);
    else if (days <= 14) behav += add("Active in last 2 weeks", 3);
  }
  behav = Math.min(45, behav);

  const score = Math.max(0, Math.min(100, Math.round(intent + behav)));
  const grade: Grade = score >= 75 ? "A" : score >= 55 ? "B" : score >= 35 ? "C" : "D";
  return { score, grade, intentPoints: Math.round(intent), behaviorPoints: Math.round(behav), reasons };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Customers + licenses (Orders sheet)
 * ────────────────────────────────────────────────────────────────────────── */

export type LicenseStatus = "active" | "expiring" | "expired" | "perpetual";

export interface License {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  edition: string;
  seats: number;
  purchasedAt: string;
  ts: number;
  termDays: number; // 0 = perpetual
  expiresAt: string | null;
  expiresTs: number | null;
  status: LicenseStatus;
  daysToExpiry: number | null; // negative = expired
  price: number;
  currency: string;
  customerEmail: string;
  customerName: string;
}

export interface Customer {
  email: string;
  name: string;
  phone: string;
  company: string;
  location: string;
  orders: Order[];
  licenses: License[];
  totalSpend: number;
  currency: string;
  firstOrderTs: number;
  lastOrderTs: number;
  ordersCount: number;
  activeLicenses: number;
  expiringLicenses: number;
  expiredLicenses: number;
}

const EXPIRING_WINDOW_DAYS = 45;

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Derive a licence term (days) + edition label from an order's text fields. */
export function deriveTerm(o: Order): { termDays: number; edition: string } {
  const hay = `${o.productName ?? ""} ${o.sku ?? ""} ${o.notes ?? ""} ${(o as Record<string, unknown>).edition ?? ""}`.toLowerCase();
  const edition =
    /enterprise/.test(hay) ? "Enterprise"
    : /pro(fessional)?/.test(hay) ? "Professional"
    : /premium/.test(hay) ? "Premium"
    : /standard/.test(hay) ? "Standard"
    : /basic|starter/.test(hay) ? "Starter"
    : "";
  if (/perpetual|lifetime|one[-\s]?time|forever/.test(hay)) return { termDays: 0, edition };
  const yr = hay.match(/(\d+)\s*[-\s]?(?:year|yr)/);
  if (yr) return { termDays: parseInt(yr[1], 10) * 365, edition };
  if (/annual|yearly|1\s*year|per\s*year/.test(hay)) return { termDays: 365, edition };
  const mo = hay.match(/(\d+)\s*[-\s]?month/);
  if (mo) return { termDays: parseInt(mo[1], 10) * 30, edition };
  if (/monthly|per\s*month/.test(hay)) return { termDays: 30, edition };
  if (/quarter/.test(hay)) return { termDays: 90, edition };
  return { termDays: 365, edition }; // sensible default: annual
}

function licenseFromOrder(o: Order, idx: number, now: number): License {
  const ts = Date.parse(String(o.timestamp ?? "")) || 0;
  const { termDays, edition } = deriveTerm(o);
  const seats = Math.max(1, toNum(o.quantity) || 1);
  const price = toNum(o.price) * seats;
  const email = String(o.email ?? "").trim().toLowerCase();
  let expiresTs: number | null = null;
  let status: LicenseStatus = "perpetual";
  let daysToExpiry: number | null = null;
  if (termDays > 0 && ts) {
    expiresTs = ts + termDays * 86_400_000;
    daysToExpiry = Math.round((expiresTs - now) / 86_400_000);
    status = daysToExpiry < 0 ? "expired" : daysToExpiry <= EXPIRING_WINDOW_DAYS ? "expiring" : "active";
  } else if (termDays === 0) {
    status = "perpetual";
  }
  return {
    id: `${email || "anon"}:${o.productId ?? o.sku ?? idx}:${ts || idx}`,
    productId: String(o.productId ?? ""),
    productName: String(o.productName ?? o.sku ?? "Product"),
    sku: String(o.sku ?? ""),
    edition,
    seats,
    purchasedAt: String(o.timestamp ?? ""),
    ts,
    termDays,
    expiresAt: expiresTs ? new Date(expiresTs).toISOString() : null,
    expiresTs,
    status,
    daysToExpiry,
    price,
    currency: String(o.currency ?? "USD"),
    customerEmail: email,
    customerName: String(o.customerName ?? ""),
  };
}

/** All licences across all orders, newest first. */
export function buildLicenses(orders: Order[], now = Date.now()): License[] {
  return orders
    .filter((o) => o.email || o.customerName)
    .map((o, i) => licenseFromOrder(o, i, now))
    .sort((a, b) => b.ts - a.ts);
}

/** Group orders by email into a 360° customer record. */
export function buildCustomers(orders: Order[], now = Date.now()): Customer[] {
  const byEmail = new Map<string, Customer>();
  for (const o of orders) {
    const email = String(o.email ?? "").trim().toLowerCase();
    const nameKey = String(o.customerName ?? "").trim().toLowerCase();
    const key = email || (nameKey ? `name:${nameKey}` : "");
    if (!key) continue;
    let c = byEmail.get(key);
    if (!c) {
      c = {
        email,
        name: String(o.customerName ?? ""),
        phone: String(o.phone ?? ""),
        company: String((o as Record<string, unknown>).company ?? ""),
        location: [o.city, o.state, o.country].filter(Boolean).join(", "),
        orders: [],
        licenses: [],
        totalSpend: 0,
        currency: String(o.currency ?? "USD"),
        firstOrderTs: 0,
        lastOrderTs: 0,
        ordersCount: 0,
        activeLicenses: 0,
        expiringLicenses: 0,
        expiredLicenses: 0,
      };
      byEmail.set(key, c);
    }
    const ts = Date.parse(String(o.timestamp ?? "")) || 0;
    c.orders.push(o);
    c.ordersCount++;
    c.totalSpend += toNum(o.price) * (Math.max(1, toNum(o.quantity) || 1));
    if (o.currency) c.currency = String(o.currency);
    if (o.phone && !c.phone) c.phone = String(o.phone);
    if (!c.name && o.customerName) c.name = String(o.customerName);
    if (!c.location) c.location = [o.city, o.state, o.country].filter(Boolean).join(", ");
    if (ts) {
      c.firstOrderTs = c.firstOrderTs ? Math.min(c.firstOrderTs, ts) : ts;
      c.lastOrderTs = Math.max(c.lastOrderTs, ts);
    }
  }

  for (const c of byEmail.values()) {
    c.licenses = buildLicenses(c.orders, now);
    c.activeLicenses = c.licenses.filter((l) => l.status === "active" || l.status === "perpetual").length;
    c.expiringLicenses = c.licenses.filter((l) => l.status === "expiring").length;
    c.expiredLicenses = c.licenses.filter((l) => l.status === "expired").length;
    c.orders.sort((a, b) => (Date.parse(String(b.timestamp ?? "")) || 0) - (Date.parse(String(a.timestamp ?? "")) || 0));
  }

  return [...byEmail.values()].sort((a, b) => b.lastOrderTs - a.lastOrderTs);
}

/** Every licence that is expiring-soon or already expired, soonest first. */
export function renewalPipeline(customers: Customer[]): License[] {
  const out: License[] = [];
  for (const c of customers) for (const l of c.licenses) if (l.status === "expiring" || l.status === "expired") out.push(l);
  return out.sort((a, b) => (a.expiresTs ?? 0) - (b.expiresTs ?? 0));
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Win-back
 * ────────────────────────────────────────────────────────────────────────── */

export interface WinBackEntry {
  customer: Customer;
  reason: string;
  /** Days since last order. */
  dormantDays: number;
  /** Priority 0..1 for sorting (spend + recency of lapse). */
  priority: number;
}

/**
 * Customers worth re-engaging: those whose licences have all lapsed, OR who
 * haven't ordered in `dormantDays` and hold no active licence. Higher spend and
 * a more recent lapse rank higher (best odds of return).
 */
export function buildWinBack(customers: Customer[], dormantDays = 120, now = Date.now()): WinBackEntry[] {
  const out: WinBackEntry[] = [];
  for (const c of customers) {
    const daysSince = c.lastOrderTs ? Math.floor((now - c.lastOrderTs) / 86_400_000) : Infinity;
    const noActive = c.activeLicenses === 0;
    const hasExpired = c.expiredLicenses > 0;
    let reason = "";
    if (hasExpired && noActive) reason = `${c.expiredLicenses} licence${c.expiredLicenses > 1 ? "s" : ""} expired, none active`;
    else if (noActive && daysSince >= dormantDays) reason = `No active licence · dormant ${daysSince}d`;
    if (!reason) continue;
    // Priority: reward spend, penalise very stale lapses (harder to win back).
    const recency = Number.isFinite(daysSince) ? Math.max(0, 1 - Math.min(daysSince, 730) / 730) : 0.2;
    const spendScore = Math.min(1, c.totalSpend / 5000);
    out.push({
      customer: c,
      reason,
      dormantDays: Number.isFinite(daysSince) ? daysSince : 9999,
      priority: recency * 0.5 + spendScore * 0.5,
    });
  }
  return out.sort((a, b) => b.priority - a.priority);
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Scored-lead convenience
 * ────────────────────────────────────────────────────────────────────────── */

export interface ScoredLead extends Lead {
  behavior?: Behavior;
  scoring: LeadScore;
}

export function scoreLeads(leads: Lead[], index: Map<string, Behavior>): ScoredLead[] {
  return leads
    .map((l) => {
      const behavior = behaviorForLead(l, index);
      return { ...l, behavior, scoring: scoreLead(l, behavior) };
    })
    .sort((a, b) => b.scoring.score - a.scoring.score);
}
