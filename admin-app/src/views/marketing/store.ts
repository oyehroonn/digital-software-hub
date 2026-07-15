/**
 * Marketing data store — the local source of truth for everything the Marketing
 * area manages: campaigns, coupons / member pricing, A/B tests, referrals,
 * promo schedule and the email send-log.
 *
 * Design mirrors `lib/offlineQueue`: a single localStorage key, a synchronous
 * read/write pair, and a subscribe() fan-out so every open view re-renders when
 * anything changes. It is intentionally self-contained (no VPS dependency) so
 * the whole area works offline — campaign *performance* is layered on top from
 * the stable Telemetry + Orders sheets at read time (see `metrics.ts`), never
 * stored here.
 *
 * First run seeds a deterministic set of records (flagged `_seed: true`) built
 * from the real DSM product line so every view renders immediately; the seed is
 * dropped the moment an admin edits/creates a real record of that type.
 */

export type Channel = "email" | "social" | "search" | "display" | "web" | "referral";
export const CHANNELS: Channel[] = ["email", "social", "search", "display", "web", "referral"];

export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "ended";

export interface Campaign {
  id: string;
  name: string;
  productId?: string;
  productName?: string;
  channel: Channel;
  status: CampaignStatus;
  budget?: number; // planned spend
  spend?: number; // actual spend to date
  goalRevenue?: number; // target revenue
  couponCode?: string; // coupon this campaign hands out
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string; // ties telemetry / landing rows back to this campaign
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  _seed?: boolean;
}

export type CouponType = "percent" | "fixed" | "member_price";

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number; // percent (0-100), fixed amount, or absolute member price
  scope: string; // "all" or a productId
  scopeName?: string; // product display name when scoped
  tier?: string; // member tier this pricing applies to (member_price)
  minQty?: number;
  maxRedemptions?: number; // 0 / undefined = unlimited
  redemptions: number;
  stackable: boolean;
  startDate?: string;
  endDate?: string;
  active: boolean;
  createdAt: number;
  _seed?: boolean;
}

export interface ABVariant {
  key: string; // "A", "B", "C"
  label: string;
  headline?: string;
  copy?: string;
  ctaText: string;
  weight: number; // traffic split weight
  impressions: number;
  clicks: number;
  conversions: number;
}

export type ABStatus = "draft" | "running" | "stopped";

export interface ABTest {
  id: string;
  name: string;
  hypothesis?: string;
  elementId: string; // heatmap / telemetry element_id the CTA lives on
  pageUrl?: string;
  status: ABStatus;
  variants: ABVariant[];
  winner?: string; // variant key
  startDate?: string;
  endDate?: string;
  createdAt: number;
  _seed?: boolean;
}

export type ReferralStatus = "active" | "paused" | "ended";

export interface Referral {
  id: string;
  code: string;
  referrerName: string;
  referrerEmail: string;
  rewardType: "percent" | "fixed" | "credit";
  rewardValue: number;
  clicks: number;
  signups: number;
  conversions: number;
  revenue: number;
  currency: string;
  status: ReferralStatus;
  createdAt: number;
  _seed?: boolean;
}

export type PromoStatus = "scheduled" | "live" | "done" | "cancelled";

export interface Promo {
  id: string;
  title: string;
  campaignId?: string;
  couponCode?: string;
  channel: Channel;
  audience?: string; // e.g. "Insiders", "All customers", "Lapsed"
  scheduledAt: string; // ISO datetime
  status: PromoStatus;
  notes?: string;
  createdAt: number;
  _seed?: boolean;
}

export type SendStatus = "sent" | "failed" | "simulated";

export interface SendLogEntry {
  id: string;
  at: number;
  kind: "blast" | "single" | "quote";
  subject: string;
  to: string;
  campaignId?: string;
  campaignName?: string;
  status: SendStatus;
  error?: string;
  batchId?: string; // groups one blast's recipients together
}

export interface MarketingState {
  campaigns: Campaign[];
  coupons: Coupon[];
  abTests: ABTest[];
  referrals: Referral[];
  promos: Promo[];
  sendLog: SendLogEntry[];
  suppress: string[]; // opted-out email addresses (never blast these)
}

const LS_KEY = "dsm-admin.marketing";
type Listener = (s: MarketingState) => void;
const listeners = new Set<Listener>();

const DAY = 86400000;
const now = Date.now();
const ymd = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString().slice(0, 10);
const iso = (offsetDays: number, hour = 9) => {
  const d = new Date(now + offsetDays * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

/** Deterministic first-run seed built from the real DSM product line. */
function seed(): MarketingState {
  return {
    campaigns: [
      {
        id: "seed-cmp-1", name: "Virtual Try-On Insider Launch", productId: "vto",
        productName: "Virtual Try-On", channel: "email", status: "active",
        budget: 4000, spend: 1180, goalRevenue: 60000, couponCode: "INSIDER20",
        utmSource: "insiders", utmMedium: "email", utmCampaign: "vto-launch",
        startDate: ymd(-6), endDate: ymd(14), notes: "Opted-in members first, 48h head start.",
        createdAt: now - 6 * DAY, updatedAt: now - 1 * DAY, _seed: true,
      },
      {
        id: "seed-cmp-2", name: "DSM Suite — Q3 Search", productId: "dsm",
        productName: "DSM", channel: "search", status: "active",
        budget: 9000, spend: 5230, goalRevenue: 120000, utmSource: "google",
        utmMedium: "cpc", utmCampaign: "dsm-q3", startDate: ymd(-20), endDate: ymd(40),
        createdAt: now - 20 * DAY, updatedAt: now - 2 * DAY, _seed: true,
      },
      {
        id: "seed-cmp-3", name: "Virtual Sizing Retargeting", productId: "vsize",
        productName: "Virtual Sizing", channel: "display", status: "paused",
        budget: 2500, spend: 900, goalRevenue: 30000, utmSource: "meta",
        utmMedium: "display", utmCampaign: "vsize-rt", startDate: ymd(-30), endDate: ymd(-2),
        createdAt: now - 30 * DAY, updatedAt: now - 5 * DAY, _seed: true,
      },
      {
        id: "seed-cmp-4", name: "Pointblank Beta Waitlist", productId: "pb",
        productName: "Pointblank", channel: "social", status: "draft",
        budget: 1500, spend: 0, goalRevenue: 20000, utmSource: "linkedin",
        utmMedium: "social", utmCampaign: "pb-beta",
        createdAt: now - 1 * DAY, updatedAt: now - 1 * DAY, _seed: true,
      },
    ],
    coupons: [
      {
        id: "seed-cpn-1", code: "INSIDER20", type: "percent", value: 20, scope: "all",
        maxRedemptions: 200, redemptions: 41, stackable: false,
        startDate: ymd(-6), endDate: ymd(14), active: true, createdAt: now - 6 * DAY, _seed: true,
      },
      {
        id: "seed-cpn-2", code: "VTO50OFF", type: "fixed", value: 50, scope: "vto",
        scopeName: "Virtual Try-On", maxRedemptions: 0, redemptions: 18, stackable: false,
        startDate: ymd(-6), endDate: ymd(14), active: true, createdAt: now - 6 * DAY, _seed: true,
      },
      {
        id: "seed-cpn-3", code: "MEMBER-PRO", type: "member_price", value: 799, scope: "dsm",
        scopeName: "DSM", tier: "Pro", maxRedemptions: 0, redemptions: 63, stackable: true,
        active: true, createdAt: now - 40 * DAY, _seed: true,
      },
    ],
    abTests: [
      {
        id: "seed-ab-1", name: "Home hero CTA", hypothesis: "Outcome-led copy beats feature-led.",
        elementId: "hero-cta", pageUrl: "/", status: "running",
        variants: [
          { key: "A", label: "Control", headline: "Precision 3D for your business", ctaText: "Get a Quote", weight: 50, impressions: 1840, clicks: 128, conversions: 14 },
          { key: "B", label: "Outcome", headline: "Win more jobs with instant 3D quotes", ctaText: "Get My Quote", weight: 50, impressions: 1795, clicks: 171, conversions: 23 },
        ],
        startDate: ymd(-9), createdAt: now - 9 * DAY, _seed: true,
      },
      {
        id: "seed-ab-2", name: "Pricing page button", hypothesis: "Urgency lifts checkout starts.",
        elementId: "pricing-buy", pageUrl: "/pricing", status: "draft",
        variants: [
          { key: "A", label: "Control", ctaText: "Buy License", weight: 50, impressions: 0, clicks: 0, conversions: 0 },
          { key: "B", label: "Urgency", ctaText: "Claim Insider Price", weight: 50, impressions: 0, clicks: 0, conversions: 0 },
        ],
        createdAt: now - 1 * DAY, _seed: true,
      },
    ],
    referrals: [
      {
        id: "seed-ref-1", code: "BETH-DSM", referrerName: "Beth Hurigan",
        referrerEmail: "beth@example.com", rewardType: "percent", rewardValue: 10,
        clicks: 220, signups: 34, conversions: 9, revenue: 8100, currency: "USD",
        status: "active", createdAt: now - 25 * DAY, _seed: true,
      },
      {
        id: "seed-ref-2", code: "SELMA-ARGO", referrerName: "Selma Christoffey",
        referrerEmail: "selma@argo.example", rewardType: "credit", rewardValue: 250,
        clicks: 410, signups: 61, conversions: 17, revenue: 15300, currency: "USD",
        status: "active", createdAt: now - 18 * DAY, _seed: true,
      },
    ],
    promos: [
      {
        id: "seed-prm-1", title: "VTO insider email — wave 2", campaignId: "seed-cmp-1",
        couponCode: "INSIDER20", channel: "email", audience: "Insiders",
        scheduledAt: iso(2, 9), status: "scheduled", createdAt: now - 1 * DAY, _seed: true,
      },
      {
        id: "seed-prm-2", title: "DSM Q3 social push", campaignId: "seed-cmp-2",
        channel: "social", audience: "All customers", scheduledAt: iso(5, 14),
        status: "scheduled", createdAt: now - 2 * DAY, _seed: true,
      },
      {
        id: "seed-prm-3", title: "Sizing win-back", couponCode: "VTO50OFF", channel: "email",
        audience: "Lapsed", scheduledAt: iso(-3, 10), status: "done",
        createdAt: now - 8 * DAY, _seed: true,
      },
    ],
    sendLog: [],
    suppress: [],
  };
}

function emptyState(): MarketingState {
  return { campaigns: [], coupons: [], abTests: [], referrals: [], promos: [], sendLog: [], suppress: [] };
}

function read(): MarketingState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(LS_KEY, JSON.stringify(s));
      return s;
    }
    const parsed = JSON.parse(raw) as Partial<MarketingState>;
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

function write(next: MarketingState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — keep in-memory listeners in sync anyway */
  }
  listeners.forEach((l) => l(next));
}

export function getState(): MarketingState {
  return read();
}

export function subscribe(fn: Listener): () => void {
  fn(read());
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Generic collection mutator. Reading a collection strips the seed rows the
 * first time a real (non-seed) record is added to it, so demo data never mixes
 * with an admin's own records.
 */
type CollKey = "campaigns" | "coupons" | "abTests" | "referrals" | "promos";

function mutate<K extends CollKey>(key: K, fn: (rows: MarketingState[K]) => MarketingState[K]) {
  const s = read();
  const next = { ...s, [key]: fn(s[key]) } as MarketingState;
  write(next);
}

/** Drop seeds in a collection when the admin commits their first real record. */
function dropSeeds<T extends { _seed?: boolean }>(rows: T[], incoming: T): T[] {
  if (incoming._seed) return rows;
  const cleaned = rows.filter((r) => !r._seed);
  return cleaned;
}

/* ----------------------------- Campaigns ----------------------------- */
export function upsertCampaign(c: Campaign) {
  mutate("campaigns", (rows) => {
    const base = dropSeeds(rows, c);
    const i = base.findIndex((r) => r.id === c.id);
    if (i >= 0) { const copy = [...base]; copy[i] = { ...c, updatedAt: Date.now() }; return copy; }
    return [{ ...c, updatedAt: Date.now() }, ...base];
  });
}
export function deleteCampaign(id: string) {
  mutate("campaigns", (rows) => rows.filter((r) => r.id !== id));
}

/* ------------------------------ Coupons ------------------------------ */
export function upsertCoupon(c: Coupon) {
  mutate("coupons", (rows) => {
    const base = dropSeeds(rows, c);
    const i = base.findIndex((r) => r.id === c.id);
    if (i >= 0) { const copy = [...base]; copy[i] = c; return copy; }
    return [c, ...base];
  });
}
export function deleteCoupon(id: string) {
  mutate("coupons", (rows) => rows.filter((r) => r.id !== id));
}

/* ----------------------------- A/B tests ----------------------------- */
export function upsertABTest(t: ABTest) {
  mutate("abTests", (rows) => {
    const base = dropSeeds(rows, t);
    const i = base.findIndex((r) => r.id === t.id);
    if (i >= 0) { const copy = [...base]; copy[i] = t; return copy; }
    return [t, ...base];
  });
}
export function deleteABTest(id: string) {
  mutate("abTests", (rows) => rows.filter((r) => r.id !== id));
}

/* ----------------------------- Referrals ----------------------------- */
export function upsertReferral(r: Referral) {
  mutate("referrals", (rows) => {
    const base = dropSeeds(rows, r);
    const i = base.findIndex((x) => x.id === r.id);
    if (i >= 0) { const copy = [...base]; copy[i] = r; return copy; }
    return [r, ...base];
  });
}
export function deleteReferral(id: string) {
  mutate("referrals", (rows) => rows.filter((r) => r.id !== id));
}

/* ------------------------------ Promos ------------------------------- */
export function upsertPromo(p: Promo) {
  mutate("promos", (rows) => {
    const base = dropSeeds(rows, p);
    const i = base.findIndex((r) => r.id === p.id);
    if (i >= 0) { const copy = [...base]; copy[i] = p; return copy; }
    return [p, ...base];
  });
}
export function deletePromo(id: string) {
  mutate("promos", (rows) => rows.filter((r) => r.id !== id));
}
export function setPromoStatus(id: string, status: PromoStatus) {
  mutate("promos", (rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
}

/* ----------------------------- Send log ------------------------------ */
export function logSends(entries: SendLogEntry[]) {
  const s = read();
  write({ ...s, sendLog: [...entries, ...s.sendLog].slice(0, 2000) });
}
export function clearSendLog() {
  const s = read();
  write({ ...s, sendLog: [] });
}

/* --------------------------- Suppression list ------------------------ */
export function suppressEmail(email: string) {
  const s = read();
  const e = email.trim().toLowerCase();
  if (!e || s.suppress.includes(e)) return;
  write({ ...s, suppress: [...s.suppress, e] });
}
export function unsuppressEmail(email: string) {
  const s = read();
  write({ ...s, suppress: s.suppress.filter((x) => x !== email.trim().toLowerCase()) });
}
