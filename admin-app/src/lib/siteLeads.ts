/**
 * SITE LEAD aggregation — reads the STABLE Orders sheet and reconstructs the
 * unified lead inbox from EVERY email the site captures.
 *
 * The public site writes each capture into the Orders sheet as a row tagged
 * with a `source` (footer newsletter, member popup, reseller signup, quote,
 * savings calculator, callback request) plus the visitor's email + notes. This
 * module classifies each Orders row by that tag, groups the captures by email
 * into a single contact, and derives first-seen, product interest and a
 * per-source breakdown — so nothing that left an email is ever lost.
 *
 * Everything here is PURE and defensive: missing columns / naming drift never
 * throw, and the data is REAL-only. When the Orders sheet isn't shared yet the
 * derivations return empty arrays and the view shows a clean empty state — no
 * fabricated leads.
 *
 * This lives ALONGSIDE the telemetry-based `lib/crm.ts` (which reconstructs
 * leads from analytics events); neither replaces the other. Together they cover
 * both capture paths the site uses.
 */
import type { Order } from "./ecommerce";

/* ────────────────────────────────────────────────────────────────────────── *
 *  Sources
 * ────────────────────────────────────────────────────────────────────────── */

/** The lead sources the SITE tags Orders-sheet captures with (+ fallbacks). */
export type SiteSource =
  | "footer"
  | "popup"
  | "reseller"
  | "quote"
  | "savings"
  | "callback"
  | "order"
  | "other";

export interface SourceMeta {
  key: SiteSource;
  label: string;
  /** One-line human description of where the capture comes from. */
  blurb: string;
  variant: "default" | "muted" | "ok" | "warn" | "down";
  /** lucide-react icon name (resolved in the view). */
  icon: string;
}

/**
 * Ordered registry. The order also decides precedence when a contact spans
 * several sources (the highest-intent source is used as their "primary").
 */
export const SITE_SOURCES: SourceMeta[] = [
  { key: "callback", label: "Callback", blurb: "Requested a call back", variant: "ok", icon: "PhoneCall" },
  { key: "quote", label: "Quote", blurb: "Asked for a price / quote", variant: "default", icon: "FileText" },
  { key: "reseller", label: "Reseller", blurb: "Reseller / partner signup", variant: "warn", icon: "Handshake" },
  { key: "savings", label: "Savings Calc", blurb: "Used the savings calculator", variant: "default", icon: "Calculator" },
  { key: "popup", label: "Member Popup", blurb: "Joined via the member popup", variant: "muted", icon: "MousePointerClick" },
  { key: "footer", label: "Newsletter", blurb: "Footer newsletter signup", variant: "muted", icon: "Mail" },
  { key: "order", label: "Purchase", blurb: "Placed an order", variant: "ok", icon: "ShoppingCart" },
  { key: "other", label: "Other", blurb: "Uncategorised capture", variant: "muted", icon: "HelpCircle" },
];

export const SOURCE_META: Record<SiteSource, SourceMeta> = Object.fromEntries(
  SITE_SOURCES.map((s) => [s.key, s]),
) as Record<SiteSource, SourceMeta>;

/** The sources that represent a LEAD (everything except a completed purchase). */
export const LEAD_SOURCES: SiteSource[] = SITE_SOURCES.map((s) => s.key).filter((k) => k !== "order");

const SOURCE_MATCHERS: { source: SiteSource; test: RegExp }[] = [
  { source: "callback", test: /call[\s_-]?back|book[\s_-]?call|schedule[\s_-]?call|request[\s_-]?call|ring[\s_-]?me/ },
  { source: "reseller", test: /resell|partner|dealer|wholesale|distributor|affiliate/ },
  { source: "quote", test: /quote|estimate|instant[\s_-]?quote|get[\s_-]?my[\s_-]?quote|pricing[\s_-]?request/ },
  { source: "savings", test: /saving|roi|calculator|cost[\s_-]?calc|see[\s_-]?my[\s_-]?savings/ },
  { source: "popup", test: /pop[\s_-]?up|member|modal|welcome|join|signup|sign[\s_-]?up|register/ },
  { source: "footer", test: /footer|news[\s_-]?letter|subscribe|subscription|mailing[\s_-]?list|updates/ },
  { source: "order", test: /^order$|purchase|checkout|store|cart|payment|paid/ },
];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/* ────────────────────────────────────────────────────────────────────────── *
 *  Field helpers (defensive — accept snake_case / camelCase / free drift)
 * ────────────────────────────────────────────────────────────────────────── */

function raw(o: Order): Record<string, unknown> {
  return o as unknown as Record<string, unknown>;
}

function str(o: Order, ...keys: string[]): string {
  const bag = raw(o);
  for (const k of keys) {
    const v = bag[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function num(o: Order, ...keys: string[]): number {
  const bag = raw(o);
  for (const k of keys) {
    const v = bag[k];
    if (v == null || v === "") continue;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Classification
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Decide which SITE source an Orders row came from. Prefers an explicit tag
 * (`source` / `lead_source` / `channel` / `form`), then falls back to notes /
 * product / sku text, then to shape (priced product line → purchase; email-only
 * row → footer newsletter). Returns "other" only when a row carries contact
 * info but no usable signal.
 */
export function classifySource(o: Order): SiteSource {
  const tag = str(o, "source", "lead_source", "leadSource", "channel", "form", "formName", "form_name", "kind", "type", "capture");
  const hay = `${tag} ${str(o, "notes", "note", "message", "comment")} ${str(o, "productName", "product_name")} ${str(o, "sku")} ${str(o, "storeName", "store_name")}`.toLowerCase();
  for (const m of SOURCE_MATCHERS) if (m.test.test(hay)) return m.source;

  // No tag matched. Infer from shape.
  const priced = num(o, "price", "amount", "total") > 0;
  const hasProduct = !!str(o, "productName", "product_name", "productId", "product_id", "sku");
  if (priced && hasProduct) return "order";
  if (str(o, "email") && !hasProduct) return "footer"; // email-only row ≈ newsletter
  return "other";
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Captures + contacts
 * ────────────────────────────────────────────────────────────────────────── */

/** One Orders-sheet row, normalised into a lead capture. */
export interface SiteCapture {
  id: string;
  source: SiteSource;
  ts: number;
  capturedAt: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  productInterest: string;
  notes: string;
  location: string;
  value: number;
  currency: string;
  /** True when the row is a completed purchase rather than a pure enquiry. */
  isOrder: boolean;
  order: Order;
}

function toCapture(o: Order, idx: number): SiteCapture {
  const source = classifySource(o);
  const emailRaw = str(o, "email", "customerEmail", "customer_email", "user_email");
  const email = (emailRaw.match(EMAIL_RE)?.[0] ?? "").toLowerCase();
  const ts = Date.parse(str(o, "timestamp", "received_at", "receivedAt", "created_at")) || 0;
  return {
    id: `${source}:${email || "anon"}:${ts || idx}:${idx}`,
    source,
    ts,
    capturedAt: str(o, "timestamp", "received_at", "receivedAt", "created_at"),
    name: str(o, "customerName", "customer_name", "name", "fullName"),
    email,
    phone: str(o, "phone", "tel", "mobile"),
    company: str(o, "company", "organisation", "organization", "business"),
    productInterest: str(o, "productName", "product_name", "product", "interest") || str(o, "productId", "product_id"),
    notes: str(o, "notes", "note", "message", "comment", "description"),
    location: [str(o, "city"), str(o, "state"), str(o, "country")].filter(Boolean).join(", "),
    value: num(o, "price", "amount", "total") * Math.max(1, num(o, "quantity", "qty") || 1),
    currency: str(o, "currency") || "USD",
    isOrder: source === "order",
    order: o,
  };
}

/** Every Orders row as a capture, newest first. */
export function deriveSiteCaptures(orders: Order[]): SiteCapture[] {
  return orders
    .map(toCapture)
    .filter((c) => c.email || c.name || c.phone) // must carry SOME contact identity
    .sort((a, b) => b.ts - a.ts);
}

/** A person, unified across every capture that shares their email (or name). */
export interface LeadContact {
  /** Stable key: email when present, else name-based, else capture id. */
  key: string;
  email: string;
  name: string;
  phone: string;
  company: string;
  location: string;
  firstSeenTs: number;
  lastSeenTs: number;
  /** Distinct sources this contact has touched, primary-first. */
  sources: SiteSource[];
  /** The single highest-intent source (registry order). */
  primarySource: SiteSource;
  sourceCounts: Partial<Record<SiteSource, number>>;
  /** Distinct products / interests expressed across captures. */
  productInterests: string[];
  captures: SiteCapture[];
  captureCount: number;
  /** Latest free-text note/intent the contact left. */
  latestNote: string;
  /** True once this contact has at least one completed purchase. */
  hasOrder: boolean;
  totalValue: number;
  currency: string;
}

const SOURCE_RANK: Record<SiteSource, number> = Object.fromEntries(
  SITE_SOURCES.map((s, i) => [s.key, i]),
) as Record<SiteSource, number>;

/**
 * Group captures into one contact per email. A visitor who signs up to the
 * newsletter, then asks for a quote, then requests a callback collapses into a
 * single row carrying all three sources — never three separate leads.
 */
export function groupLeadContacts(captures: SiteCapture[]): LeadContact[] {
  const byKey = new Map<string, LeadContact>();
  for (const c of captures) {
    const nameKey = c.name.trim().toLowerCase();
    const key = c.email || (nameKey ? `name:${nameKey}` : `id:${c.id}`);
    let ct = byKey.get(key);
    if (!ct) {
      ct = {
        key,
        email: c.email,
        name: c.name,
        phone: c.phone,
        company: c.company,
        location: c.location,
        firstSeenTs: c.ts || 0,
        lastSeenTs: c.ts || 0,
        sources: [],
        primarySource: c.source,
        sourceCounts: {},
        productInterests: [],
        captures: [],
        captureCount: 0,
        latestNote: "",
        hasOrder: false,
        totalValue: 0,
        currency: c.currency,
      };
      byKey.set(key, ct);
    }
    ct.captures.push(c);
    ct.captureCount++;
    ct.sourceCounts[c.source] = (ct.sourceCounts[c.source] ?? 0) + 1;
    ct.hasOrder ||= c.isOrder;
    ct.totalValue += c.isOrder ? c.value : 0;
    // Fill best-available identity fields.
    if (!ct.name && c.name) ct.name = c.name;
    if (!ct.phone && c.phone) ct.phone = c.phone;
    if (!ct.company && c.company) ct.company = c.company;
    if (!ct.location && c.location) ct.location = c.location;
    if (c.currency) ct.currency = c.currency;
    if (c.productInterest && !ct.productInterests.includes(c.productInterest)) ct.productInterests.push(c.productInterest);
    if (c.ts) {
      ct.firstSeenTs = ct.firstSeenTs ? Math.min(ct.firstSeenTs, c.ts) : c.ts;
      ct.lastSeenTs = Math.max(ct.lastSeenTs, c.ts);
    }
  }

  for (const ct of byKey.values()) {
    ct.sources = Object.keys(ct.sourceCounts)
      .map((s) => s as SiteSource)
      .sort((a, b) => SOURCE_RANK[a] - SOURCE_RANK[b]);
    ct.primarySource = ct.sources[0] ?? "other";
    // Latest note = most recent non-empty capture note.
    const withNote = [...ct.captures].filter((c) => c.notes).sort((a, b) => b.ts - a.ts)[0];
    ct.latestNote = withNote?.notes ?? "";
    ct.captures.sort((a, b) => b.ts - a.ts);
  }

  return [...byKey.values()].sort((a, b) => b.lastSeenTs - a.lastSeenTs);
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Breakdown + summary
 * ────────────────────────────────────────────────────────────────────────── */

export interface SourceStat {
  source: SiteSource;
  meta: SourceMeta;
  /** Number of individual captures with this source. */
  captures: number;
  /** Number of distinct contacts that have touched this source. */
  contacts: number;
  pct: number; // share of all captures
}

/** Per-source breakdown (how many leads per source), registry order. */
export function sourceBreakdown(captures: SiteCapture[], contacts: LeadContact[]): SourceStat[] {
  const capBy = new Map<SiteSource, number>();
  for (const c of captures) capBy.set(c.source, (capBy.get(c.source) ?? 0) + 1);
  const contactBy = new Map<SiteSource, number>();
  for (const ct of contacts) for (const s of ct.sources) contactBy.set(s, (contactBy.get(s) ?? 0) + 1);
  const total = captures.length || 1;
  return SITE_SOURCES.map((meta) => {
    const cap = capBy.get(meta.key) ?? 0;
    return {
      source: meta.key,
      meta,
      captures: cap,
      contacts: contactBy.get(meta.key) ?? 0,
      pct: Math.round((cap / total) * 100),
    };
  }).filter((s) => s.captures > 0);
}

export interface LeadSummary {
  contacts: number;
  captures: number;
  leads: number; // contacts that are NOT already customers
  customers: number; // contacts with ≥1 order
  newThisWeek: number;
  activeSources: number;
}

export function leadSummary(captures: SiteCapture[], contacts: LeadContact[]): LeadSummary {
  const weekAgo = Date.now() - 7 * 86_400_000;
  const activeSources = new Set(captures.map((c) => c.source)).size;
  return {
    contacts: contacts.length,
    captures: captures.length,
    leads: contacts.filter((c) => !c.hasOrder).length,
    customers: contacts.filter((c) => c.hasOrder).length,
    newThisWeek: contacts.filter((c) => c.firstSeenTs >= weekAgo).length,
    activeSources,
  };
}
