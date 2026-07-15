/**
 * Reseller / B2B foundation — wholesale pricing, deal reg & commissions
 * ---------------------------------------------------------------------
 * The B2B counterpart to lib/account.ts. Where `account.ts` powers the
 * end-customer member portal, this module powers the *reseller* portal: a free,
 * email-based B2B identity that carries a wholesale pricing tier, deal
 * registrations, and a commission view over the reseller's own orders.
 *
 * It deliberately REUSES the STABLE accounts/auth foundation:
 *  - The email session is the same one `account.ts` opens (`signIn` /
 *    `currentUser`) — a reseller is a signed-in member with a reseller profile
 *    layered on top. Signing into the reseller portal also opens a normal member
 *    session, so a partner never has to log in twice.
 *  - Durable records ride ONLY the STABLE Ecommerce Apps Script (a reseller row
 *    on the Members/Telemetry sheet; deal registrations + bulk-quote requests as
 *    `type:"order"` rows tagged `reseller`) and the Email API (`/api/email`).
 *  - It NEVER talks to the unstable VPS. Every network write is fire-and-forget
 *    or degrades to the offline queue via `submitOrder`; every read degrades to
 *    an empty list. The portal is never broken by a flaky backend.
 *
 * The Apps Script SECRET is never shipped to the browser: reads are the same
 * secret-free, email-scoped `action=licenses&email=…` GET the member portal uses.
 */

import {
  ANALYTICS_URL,
  STORE_NAME,
  getAnonymousId,
  getSessionId,
  track,
} from './stable/analytics';
import {
  currentUser,
  isValidEmail,
  normalizeEmail,
  signIn,
  type Account,
} from './account';
import { submitOrder, type OrderResult } from './stable/orders';
import { sendProxyEmail } from './emailProxy';

// ── Wholesale tiers ───────────────────────────────────────────────────────────
//
// A reseller's tier sets their standing wholesale discount off retail (their
// margin) and the price multiplier applied to any retail price in the price
// list. Tiers auto-upgrade with annual volume (see `deriveTier`), but every
// registered reseller starts as an Authorized partner immediately.

export type ResellerTier = 'authorized' | 'silver' | 'gold' | 'platinum';

export interface TierSpec {
  id: ResellerTier;
  label: string;
  /** Standing wholesale discount off retail == the reseller's gross margin, %. */
  marginPct: number;
  /** Annual units at/above which this tier applies. */
  minAnnualUnits: number;
  /** One-line positioning shown in the portal. */
  blurb: string;
}

/** Ordered low→high. The reseller's margin is `1 - price/retail`. */
export const RESELLER_TIERS: readonly TierSpec[] = [
  {
    id: 'authorized',
    label: 'Authorized',
    marginPct: 15,
    minAnnualUnits: 0,
    blurb: 'Every registered partner — 15% standing margin on all licenses.',
  },
  {
    id: 'silver',
    label: 'Silver',
    marginPct: 22,
    minAnnualUnits: 25,
    blurb: '25+ units a year — 22% margin plus deal registration protection.',
  },
  {
    id: 'gold',
    label: 'Gold',
    marginPct: 30,
    minAnnualUnits: 100,
    blurb: '100+ units a year — 30% margin, priority bulk quotes, co-marketing.',
  },
  {
    id: 'platinum',
    label: 'Platinum',
    marginPct: 38,
    minAnnualUnits: 300,
    blurb: '300+ units a year — 38% margin, named partner manager, lead sharing.',
  },
] as const;

export function tierSpec(tier: ResellerTier): TierSpec {
  return RESELLER_TIERS.find((t) => t.id === tier) ?? RESELLER_TIERS[0];
}

/** The highest tier whose annual-unit threshold `units` meets. */
export function deriveTier(units: number): ResellerTier {
  let out: ResellerTier = 'authorized';
  for (const t of RESELLER_TIERS) if (units >= t.minAnnualUnits) out = t.id;
  return out;
}

// ── Reseller profile (client session, mirrored to STABLE backend) ─────────────

export interface ResellerProfile {
  /** Normalised email — shared with the member session key. */
  email: string;
  /** Trading / company name. */
  company: string;
  contactName?: string;
  phone?: string;
  country?: string;
  /** Optional tax / VAT / reseller-permit id the partner supplies. */
  taxId?: string;
  /** Current wholesale tier (auto-upgrades with volume). */
  tier: ResellerTier;
  /** Self-reported expected annual units at registration (seeds the tier). */
  estAnnualUnits?: number;
  /** ISO timestamp of registration. */
  registeredAt: string;
}

export interface RegisterResellerInput {
  email: string;
  company: string;
  contactName?: string;
  phone?: string;
  country?: string;
  taxId?: string;
  estAnnualUnits?: number;
}

const PROFILE_KEY = 'dsm.reseller';
const DEALS_KEY = 'dsm.reseller.deals';
const hasWindow = typeof window !== 'undefined';

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
    /* private mode / quota — best-effort */
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

// ── Reseller session subscription ─────────────────────────────────────────────

type ResellerListener = (profile: ResellerProfile | null) => void;
const listeners = new Set<ResellerListener>();

/** Subscribe to reseller register / sign-out. Returns an unsubscribe fn. */
export function onResellerChange(cb: ResellerListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit(profile: ResellerProfile | null): void {
  for (const cb of listeners) {
    try {
      cb(profile);
    } catch {
      /* a listener must not break the session */
    }
  }
}

/** The reseller profile for the signed-in email, or null. */
export function currentReseller(): ResellerProfile | null {
  const p = readJSON<ResellerProfile>(PROFILE_KEY);
  if (!p || typeof p.email !== 'string' || !p.email) return null;
  // Only valid while the matching member session is open.
  const acct = currentUser();
  if (!acct || acct.email !== p.email) return null;
  return p;
}

export function isReseller(): boolean {
  return currentReseller() !== null;
}

/**
 * Register (or sign back in) as a DSM reseller. Opens the shared member session
 * for the email, writes the reseller profile locally, and mirrors a durable
 * reseller row to the STABLE Apps Script (telemetry event + best-effort
 * `type:"member"` row tagged `role:"reseller"`). Fire-and-forget on the network;
 * throws only on an invalid email/company.
 */
export function registerReseller(input: RegisterResellerInput): ResellerProfile {
  const email = normalizeEmail(input.email);
  const company = String(input.company ?? '').trim();
  if (!company) throw new Error('Please enter your company / trading name.');

  const units = Number.isFinite(input.estAnnualUnits) ? Number(input.estAnnualUnits) : 0;
  const profile: ResellerProfile = {
    email,
    company,
    contactName: input.contactName?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    country: input.country?.trim() || undefined,
    taxId: input.taxId?.trim() || undefined,
    tier: deriveTier(units),
    estAnnualUnits: units || undefined,
    registeredAt: new Date().toISOString(),
  };

  // Reuse the member auth session so the partner is signed in everywhere.
  signIn(email, { displayName: profile.contactName ?? company });
  writeJSON(PROFILE_KEY, profile);
  recordReseller(profile);
  emit(profile);
  return profile;
}

/** Quick sign-in for a returning reseller (email only). Returns null if we have
 *  no stored profile for that email — the caller should show registration. */
export function resellerSignIn(email: string): ResellerProfile | null {
  const clean = normalizeEmail(email);
  signIn(clean, {});
  const stored = readJSON<ResellerProfile>(PROFILE_KEY);
  if (stored && stored.email === clean) {
    recordReseller(stored);
    emit(stored);
    return stored;
  }
  return null;
}

/** Close the reseller profile (keeps the underlying member session unless
 *  `alsoMember` is set). */
export function signOutReseller(): void {
  removeKey(PROFILE_KEY);
  track({ event: 'reseller_signout', eventType: 'custom' });
  emit(null);
}

/** Patch the stored profile (e.g. after a tier re-evaluation). */
export function updateResellerProfile(patch: Partial<ResellerProfile>): ResellerProfile | null {
  const current = currentReseller();
  if (!current) return null;
  const next = { ...current, ...patch, email: current.email };
  writeJSON(PROFILE_KEY, next);
  emit(next);
  return next;
}

function recordReseller(profile: ResellerProfile): void {
  track({
    event: 'reseller_register',
    eventType: 'custom',
    metadata: {
      email: profile.email,
      company: profile.company,
      tier: profile.tier,
      country: profile.country,
    },
  });

  if (typeof fetch === 'undefined') return;
  const payload = {
    type: 'member',
    role: 'reseller',
    storeName: STORE_NAME,
    sessionId: getSessionId(),
    anonymousId: getAnonymousId(),
    email: profile.email,
    displayName: profile.contactName ?? profile.company,
    company: profile.company,
    tier: profile.tier,
    phone: profile.phone,
    country: profile.country,
    taxId: profile.taxId,
    registeredAt: profile.registeredAt,
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
    /* never let recording break registration */
  }
}

// ── Wholesale pricing helpers ─────────────────────────────────────────────────

export interface WholesalePrice {
  /** Parsed retail price. */
  retail: number;
  /** Reseller (wholesale) buy price after the tier margin. */
  wholesale: number;
  /** Absolute margin per unit == retail - wholesale. */
  margin: number;
  /** Detected currency prefix (e.g. "$", "AED "). */
  currency: string;
  /** Pre-formatted wholesale price, e.g. "$109.65". */
  formatted: string;
  /** Pre-formatted retail price for side-by-side display. */
  retailFormatted: string;
}

/**
 * Compute the wholesale price for a retail display price string, at a tier.
 * Returns null when no numeric price can be read (e.g. "Contact us"), so callers
 * can simply skip the wholesale badge.
 */
export function wholesalePrice(
  priceText: string | number | undefined,
  tier: ResellerTier,
): WholesalePrice | null {
  if (priceText == null) return null;
  const text = String(priceText);
  const match = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const retail = Number.parseFloat(match[1]);
  if (!Number.isFinite(retail) || retail <= 0) return null;

  const pct = tierSpec(tier).marginPct;
  const currencyRaw = text.slice(0, text.indexOf(match[1])).trim();
  const prefix = currencyRaw ? (currencyRaw.length > 1 ? `${currencyRaw} ` : currencyRaw) : '';
  const wholesale = Math.round(retail * (1 - pct / 100) * 100) / 100;
  const margin = Math.round((retail - wholesale) * 100) / 100;
  return {
    retail,
    wholesale,
    margin,
    currency: prefix,
    formatted: `${prefix}${wholesale.toFixed(2)}`,
    retailFormatted: `${prefix}${retail.toFixed(2)}`,
  };
}

// ── Downloadable price list ───────────────────────────────────────────────────
//
// The DSM own-product catalogue (retail USD), matched to the boxes featured on
// the marketing site. The reseller downloads it as a CSV with their tier's
// wholesale column so they can quote end customers immediately.

export interface PriceListItem {
  product: string;
  sku: string;
  retail: number;
}

export const RESELLER_PRICE_LIST: readonly PriceListItem[] = [
  { product: 'DSM (Digital Software Market)', sku: 'DSM-PLT', retail: 1490 },
  { product: 'Virtual Sizing', sku: 'DSM-VSZ', retail: 890 },
  { product: 'Virtual Try-On', sku: 'DSM-VTO', retail: 990 },
  { product: 'Pointblank', sku: 'DSM-PBK', retail: 640 },
  { product: 'PreserveMy.World', sku: 'DSM-PMW', retail: 420 },
  { product: 'VPO (Virtual Product Office)', sku: 'DSM-VPO', retail: 1250 },
  { product: 'TechRealm', sku: 'DSM-TRM', retail: 1800 },
  { product: 'LogicPacks', sku: 'DSM-LGP', retail: 360 },
  { product: 'Lazyware', sku: 'DSM-LZW', retail: 280 },
  { product: 'Bringit', sku: 'DSM-BRG', retail: 520 },
  { product: 'FlyAquab', sku: 'DSM-FLA', retail: 340 },
  { product: 'Apex', sku: 'DSM-APX', retail: 760 },
  { product: 'Ummah Directory', sku: 'DSM-UMD', retail: 240 },
] as const;

/** Build a CSV price list for a tier (retail, wholesale, margin per unit). */
export function buildPriceListCsv(tier: ResellerTier): string {
  const spec = tierSpec(tier);
  const rows: string[] = [];
  rows.push(`${STORE_NAME} Reseller Price List`);
  rows.push(`Tier,${spec.label} (${spec.marginPct}% margin)`);
  rows.push(`Generated,${new Date().toISOString().slice(0, 10)}`);
  rows.push('Currency,USD');
  rows.push('');
  rows.push('Product,SKU,Retail,Your Wholesale,Margin/Unit');
  for (const item of RESELLER_PRICE_LIST) {
    const wholesale = Math.round(item.retail * (1 - spec.marginPct / 100) * 100) / 100;
    const margin = Math.round((item.retail - wholesale) * 100) / 100;
    rows.push(
      [
        `"${item.product}"`,
        item.sku,
        item.retail.toFixed(2),
        wholesale.toFixed(2),
        margin.toFixed(2),
      ].join(','),
    );
  }
  return rows.join('\n');
}

/** Trigger a browser download of the tier price list. No-op outside the browser. */
export function downloadPriceList(tier: ResellerTier): void {
  if (!hasWindow) return;
  const csv = buildPriceListCsv(tier);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dsm-reseller-price-list-${tier}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  track({ event: 'reseller_price_list_download', eventType: 'custom', metadata: { tier } });
}

// ── Order & commission history (secret-free, email-scoped read) ────────────────

export interface ResellerOrder {
  product: string;
  productId?: string;
  sku?: string;
  quantity: number;
  /** Unit price parsed from the order row (0 when the sheet has none). */
  unitPrice: number;
  currency: string;
  purchasedAt: string;
  orderRef?: string;
  /** Estimated commission == line total × tier margin. */
  commission: number;
}

interface RawOrderRow {
  timestamp?: string;
  createdAt?: string;
  date?: string;
  productName?: string;
  product?: string;
  productId?: string | number;
  sku?: string;
  quantity?: number | string;
  price?: number | string;
  currency?: string;
  orderId?: string;
  clientRef?: string;
  [k: string]: unknown;
}

function parseRows(text: string): RawOrderRow[] {
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data as RawOrderRow[];
    for (const k of ['licenses', 'orders', 'rows', 'data'] as const) {
      if (Array.isArray((data as Record<string, unknown>)?.[k])) {
        return (data as Record<string, RawOrderRow[]>)[k];
      }
    }
    return [];
  } catch {
    return [];
  }
}

function parsePrice(raw: number | string | undefined): { value: number; currency: string } {
  if (raw == null) return { value: 0, currency: '' };
  if (typeof raw === 'number') return { value: raw, currency: '' };
  const text = String(raw);
  const m = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  const value = m ? Number.parseFloat(m[1]) : 0;
  const currencyRaw = m ? text.slice(0, text.indexOf(m[1])).trim() : '';
  const currency = currencyRaw ? (currencyRaw.length > 1 ? `${currencyRaw} ` : currencyRaw) : '';
  return { value: Number.isFinite(value) ? value : 0, currency };
}

function parseDate(...candidates: (string | undefined)[]): number {
  for (const c of candidates) {
    if (!c) continue;
    const t = Date.parse(c);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

/**
 * Read the reseller's orders from the Orders sheet, scoped by their email, and
 * compute an estimated commission per line at their tier margin. Secret-free
 * readable GET against the STABLE Apps Script (`action=licenses&email=…` — the
 * same email-scoped endpoint the member portal reads). Any failure degrades to
 * an empty list; the portal never breaks on an Orders read.
 */
export async function getResellerOrders(
  email?: string,
  tier: ResellerTier = 'authorized',
  opts: { timeoutMs?: number } = {},
): Promise<ResellerOrder[]> {
  const target = email ?? currentReseller()?.email ?? currentUser()?.email;
  if (!target || !isValidEmail(target)) return [];
  const clean = normalizeEmail(target);
  const marginPct = tierSpec(tier).marginPct;

  const qs = new URLSearchParams({ action: 'licenses', email: clean });
  const url = `${ANALYTICS_URL}?${qs.toString()}`;
  const timeoutMs = opts.timeoutMs ?? 8000;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(url, { signal: controller?.signal });
    if (!res.ok) return [];
    const rows = parseRows(await res.text());
    return rows
      .map((row): ResellerOrder => {
        const { value: unitPrice, currency } = parsePrice(row.price);
        const quantity = row.quantity != null ? Number(row.quantity) || 1 : 1;
        const purchasedMs = parseDate(row.createdAt, row.timestamp, row.date);
        const commission = Math.round(unitPrice * quantity * (marginPct / 100) * 100) / 100;
        return {
          product: String(row.productName || row.product || row.productId || 'Unknown product'),
          productId: row.productId != null ? String(row.productId) : undefined,
          sku: row.sku,
          quantity,
          unitPrice,
          currency,
          purchasedAt: new Date(purchasedMs).toISOString(),
          orderRef: row.orderId ?? row.clientRef,
          commission,
        };
      })
      .sort((a, b) => Date.parse(b.purchasedAt) - Date.parse(a.purchasedAt));
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface CommissionSummary {
  /** Total units across all orders. */
  units: number;
  /** Gross order value (Σ unitPrice × qty). */
  gross: number;
  /** Total estimated commission. */
  commission: number;
  /** Currency prefix detected on the orders (best-effort). */
  currency: string;
  /** Tier the volume qualifies for (may exceed the stored tier → upgrade). */
  qualifiesFor: ResellerTier;
}

export function summariseCommissions(orders: ResellerOrder[]): CommissionSummary {
  let units = 0;
  let gross = 0;
  let commission = 0;
  let currency = '';
  for (const o of orders) {
    units += o.quantity;
    gross += o.unitPrice * o.quantity;
    commission += o.commission;
    if (!currency && o.currency) currency = o.currency;
  }
  return {
    units,
    gross: Math.round(gross * 100) / 100,
    commission: Math.round(commission * 100) / 100,
    currency,
    qualifiesFor: deriveTier(units),
  };
}

// ── Deal registrations & bulk quotes ──────────────────────────────────────────

export type DealStatus = 'registered' | 'quoted' | 'won' | 'lost';

export interface DealRegistration {
  id: string;
  /** Reseller email that owns the deal. */
  email: string;
  /** Deal / opportunity name. */
  dealName: string;
  /** End-customer company. */
  endCustomer: string;
  product: string;
  quantity: number;
  /** Estimated deal value (numeric, currency-agnostic). */
  estValue?: number;
  /** Expected close date (ISO). */
  closeDate?: string;
  notes?: string;
  status: DealStatus;
  registeredAt: string;
  /** Correlation ref from the Apps Script submit. */
  clientRef?: string;
}

export interface RegisterDealInput {
  dealName: string;
  endCustomer: string;
  product: string;
  quantity: number;
  estValue?: number;
  closeDate?: string;
  notes?: string;
  /** Set true to request a formal bulk quote (vs. protect a deal). */
  bulkQuote?: boolean;
}

function makeDealId(): string {
  if (hasWindow && 'crypto' in window && typeof window.crypto.randomUUID === 'function') {
    return `deal_${window.crypto.randomUUID()}`;
  }
  return `deal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Locally-stored deals for the signed-in reseller (newest first). */
export function listDeals(email?: string): DealRegistration[] {
  const target = (email ?? currentReseller()?.email ?? currentUser()?.email ?? '')
    .trim()
    .toLowerCase();
  if (!target) return [];
  const all = readJSON<DealRegistration[]>(DEALS_KEY) ?? [];
  return all
    .filter((d) => d.email === target)
    .sort((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt));
}

function persistDeal(deal: DealRegistration): void {
  const all = readJSON<DealRegistration[]>(DEALS_KEY) ?? [];
  all.push(deal);
  writeJSON(DEALS_KEY, all);
}

export interface RegisterDealResult {
  deal: DealRegistration;
  /** Result of the STABLE Apps Script submit (confirmed or queued). */
  order: OrderResult;
  /** True if the notification email left via /api/email. */
  emailed: boolean;
}

/**
 * Register a deal (or request a bulk quote). Durably records it on the STABLE
 * Ecommerce Apps Script as a `type:"order"` row tagged `reseller` (via
 * `submitOrder`, which itself falls back to the offline queue if the network is
 * flaky), stores it locally for the portal, and fires a notification email
 * through `/api/email`. Never throws for network reasons — the deal is captured
 * even fully offline.
 */
export async function registerDeal(input: RegisterDealInput): Promise<RegisterDealResult> {
  const reseller = currentReseller();
  const email = reseller?.email ?? currentUser()?.email;
  if (!email) throw new Error('Please sign in as a reseller first.');

  const dealName = String(input.dealName ?? '').trim();
  const endCustomer = String(input.endCustomer ?? '').trim();
  const product = String(input.product ?? '').trim();
  if (!dealName || !endCustomer || !product) {
    throw new Error('Deal name, end customer and product are all required.');
  }
  const quantity = Math.max(1, Number(input.quantity) || 1);
  const kind = input.bulkQuote ? 'bulk_quote' : 'deal_registration';
  const tag = input.bulkQuote ? '[RESELLER BULK QUOTE]' : '[RESELLER DEAL REG]';

  const deal: DealRegistration = {
    id: makeDealId(),
    email,
    dealName,
    endCustomer,
    product,
    quantity,
    estValue: Number.isFinite(input.estValue) ? Number(input.estValue) : undefined,
    closeDate: input.closeDate || undefined,
    notes: input.notes?.trim() || undefined,
    status: 'registered',
    registeredAt: new Date().toISOString(),
  };

  const noteParts = [
    tag,
    `deal="${dealName}"`,
    `endCustomer="${endCustomer}"`,
    reseller?.company ? `reseller="${reseller.company}"` : '',
    reseller?.tier ? `tier=${reseller.tier}` : '',
    deal.estValue != null ? `estValue=${deal.estValue}` : '',
    deal.closeDate ? `closeDate=${deal.closeDate}` : '',
    deal.notes ? `notes="${deal.notes}"` : '',
  ].filter(Boolean);

  // STABLE, resilient write (confirms or queues for retry).
  const order = await submitOrder({
    customerName: reseller?.contactName ?? reseller?.company ?? email,
    email,
    phone: reseller?.phone,
    country: reseller?.country,
    productId: `reseller-${kind}`,
    productName: product,
    quantity,
    price: deal.estValue ?? 0,
    notes: noteParts.join(' | '),
  });
  deal.clientRef = order.clientRef;

  persistDeal(deal);
  track({
    event: input.bulkQuote ? 'reseller_bulk_quote' : 'reseller_deal_register',
    eventType: 'custom',
    metadata: { dealName, endCustomer, product, quantity, tier: reseller?.tier },
  });

  // Best-effort notification via /api/email (the resilient email proxy).
  const subject = input.bulkQuote
    ? `Bulk quote request — ${product} ×${quantity} (${reseller?.company ?? email})`
    : `Deal registration — ${dealName} (${reseller?.company ?? email})`;
  const lines = [
    input.bulkQuote ? 'A reseller requested a bulk quote.' : 'A reseller registered a deal.',
    '',
    `Reseller:     ${reseller?.company ?? '—'} <${email}>`,
    `Tier:         ${reseller ? tierSpec(reseller.tier).label : '—'}`,
    `Deal:         ${dealName}`,
    `End customer: ${endCustomer}`,
    `Product:      ${product}`,
    `Quantity:     ${quantity}`,
    deal.estValue != null ? `Est. value:   ${deal.estValue}` : '',
    deal.closeDate ? `Close date:   ${deal.closeDate}` : '',
    deal.notes ? `Notes:        ${deal.notes}` : '',
    '',
    `Ref: ${deal.clientRef ?? '—'}`,
  ].filter(Boolean);
  const emailRes = await sendProxyEmail({
    to: email,
    subject,
    body: lines.join('\n'),
  }).catch(() => ({ ok: false }));

  return { deal, order, emailed: emailRes.ok === true };
}
