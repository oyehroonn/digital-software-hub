/**
 * Legacy storefront links — where LICENSING purchases are completed.
 * ------------------------------------------------------------------
 * Third-party licenses (Microsoft, Autodesk, Corel, …) are not sold on this
 * revamped React storefront; the buyer is redirected to the ORIGINAL DSM web to
 * finish the purchase. This module derives that product URL from the catalog
 * entry (id / name / folder-slug).
 *
 * ⚠️ FLAG — OLD-WEB BASE + PRODUCT URL PATTERN ARE ASSUMED, NOT CONFIRMED.
 *   • Base: derived from the DSM socials / marketing site domain
 *     (`digitalsoftwaremarket.com`). The actual licensing storefront host is
 *     unknown — set `VITE_OLD_WEB_BASE` once confirmed.
 *   • Pattern: the catalog ids (e.g. 8158) look like WooCommerce/WordPress post
 *     ids, so `/?p=<id>` is used as the always-resolves fallback and
 *     `/product/<slug>/` as the pretty-permalink primary. Confirm which the old
 *     site actually uses and adjust `oldWebProductUrl` accordingly.
 *
 * ── Buy Now → Woo checkout deep-link (2026-09) ───────────────────────────────
 * The old site is a real WooCommerce store. WooCommerce supports
 * `?add-to-cart=<product_id>&quantity=<n>` on ANY page load to auto-add an
 * item to the cart, so `wooCheckoutUrl()` builds a direct link straight to
 * `/checkout/` with the item already in the cart — no second "Buy Now" click
 * required on the old site.
 *
 * This site's catalog ids don't share a namespace with Woo's product ids, so
 * `src/data/wooProductMap.json` (built by `scripts/generate-woo-product-map.mjs`,
 * matched by product name against the live WooCommerce REST API, refreshed
 * periodically — NOT looked up live on every click) maps this site's product
 * id → confident Woo product id. `purchaseUrl()` is what call sites should
 * use: it returns the precise add-to-cart checkout link when we have a
 * confident match, and falls back to the (pre-existing, unchanged) best-effort
 * guessed product-page link — never a wrong-product/wrong-price checkout — for
 * anything unmatched.
 *
 * Both paths are tagged with UTM params (`ATTRIBUTION_PARAMS` below) so the
 * old site's WooCommerce/GA can attribute the resulting order to this (new)
 * site's traffic. See that constant's comment for what this can and can't
 * capture — we have read-only REST API access to the old site, not
 * write/edit access to its theme or plugin code, so UTM-on-the-click is the
 * whole mechanism; there's no server-side order-meta tagging without a code
 * change on that live production system (out of scope without explicit
 * approval — it has a payment gateway on it).
 */
import wooProductMapData from '@/data/wooProductMap.json';

/** Assumed base of the original DSM licensing storefront. Override in env. */
export const OLD_WEB_BASE: string = (
  (import.meta.env.VITE_OLD_WEB_BASE as string | undefined) ??
  'https://www.digitalsoftwaremarkett.com'
).replace(/\/$/, '');

/** True when we're using the assumed (unconfirmed) base rather than an env one. */
export const OLD_WEB_BASE_IS_ASSUMED: boolean =
  !(import.meta.env.VITE_OLD_WEB_BASE as string | undefined);

export interface CatalogRef {
  id?: string | number;
  name?: string;
  /** Catalog folder, e.g. "8158_Microsoft_Windows_Server_2022_Datacenter_16_Core". */
  folder?: string;
  /** Explicit link if the catalog ever provides one (wins over derivation). */
  link?: string;
}

/** URL-safe slug from a product name or folder. */
export function slugify(input: string): string {
  return String(input ?? '')
    .toLowerCase()
    .replace(/^\d+[_-]?/, '') // drop a leading numeric id like "8158_"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Best-effort URL to a product on the original DSM web.
 * Prefers an explicit `link`; else a pretty `/product/<slug>/` permalink; else
 * the numeric-id `/?p=<id>` fallback; else the base itself.
 *
 * This is the GRACEFUL FALLBACK used when we don't have a confident
 * WooCommerce id (see `purchaseUrl` below) — it lands the buyer on a product
 * page (or the store root) rather than a dead end, but does NOT pre-add
 * anything to the Woo cart, since we can't be sure which Woo product that is.
 */
export function oldWebProductUrl(ref: CatalogRef): string {
  if (ref.link && /^https?:\/\//i.test(ref.link)) return ref.link;

  const slugSource = ref.name || ref.folder;
  if (slugSource) {
    const slug = slugify(slugSource);
    if (slug) return `${OLD_WEB_BASE}/product/${slug}/`;
  }

  if (ref.id != null && /^\d+$/.test(String(ref.id))) {
    return `${OLD_WEB_BASE}/?p=${ref.id}`;
  }

  return `${OLD_WEB_BASE}/`;
}

// ── Woo product-id map (static, generated) ──────────────────────────────────

interface WooMapEntry {
  wooId: number;
  wooName: string;
  wooPrice?: string;
  /** "high" = exact/near-exact name match (+ price agreement when ambiguous).
   *  "medium" = strong fuzzy name match with price agreement within 15%. Both
   *  tiers are used — see scripts/generate-woo-product-map.mjs for exactly
   *  what each requires; neither is a loose guess. */
  confidence: 'high' | 'medium';
  method: string;
}

type WooProductMapFile = {
  products: Record<string, WooMapEntry>;
};

const WOO_PRODUCT_MAP: Record<string, WooMapEntry> =
  (wooProductMapData as WooProductMapFile).products ?? {};

/** The confident WooCommerce match for a catalog ref, or `undefined`. */
export function wooMatch(ref: CatalogRef): WooMapEntry | undefined {
  if (ref.id == null) return undefined;
  return WOO_PRODUCT_MAP[String(ref.id)];
}

/** True when this product has a confident WooCommerce id (safe to deep-link). */
export function hasWooMatch(ref: CatalogRef): boolean {
  return wooMatch(ref) !== undefined;
}

// ── Sales attribution (UTM) ──────────────────────────────────────────────────
//
// The only lever we have without write access to the old site's WordPress
// theme/plugin code: UTM params on the click that lands on the old site. Once
// there, WooCommerce/GA's normal referrer/UTM-based attribution (whatever the
// old site already has configured) can credit the resulting order to this
// campaign — same as any other marketing-attribution flow, nothing custom
// needed there. LIMITS: this tags the *click*, not the order row itself — we
// cannot stamp Woo order META with "source=dsm_ai_site" (that needs a
// functions.php-equivalent snippet reading the query param at
// woocommerce_add_to_cart / checkout time, which requires edit access we
// don't have and are not adding without explicit approval, since that's a
// separate live production system with a payment gateway on it). If Woo/GA's
// attribution window expires (browser closed, long gap before purchase, an
// ad blocker stripping GA), the link back to this campaign can be lost — this
// is inherent to UTM/referrer attribution, not something a URL param can fix.
const ATTRIBUTION_PARAMS = {
  utm_source: 'dsm_ai_site',
  utm_medium: 'referral',
  utm_campaign: 'new_site_buy_now',
} as const;

function withAttribution(url: string): string {
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(ATTRIBUTION_PARAMS)) {
      if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    }
    return u.toString();
  } catch {
    return url; // malformed URL (shouldn't happen) — return as-is rather than throw
  }
}

// ── Buy Now → checkout URL ───────────────────────────────────────────────────

/**
 * Direct link into the OLD site's checkout with the item ALREADY in the cart
 * (WooCommerce's `?add-to-cart=<id>&quantity=<n>` auto-add-on-load behavior),
 * tagged with UTM params for sales attribution. Returns `undefined` when we
 * don't have a confident WooCommerce id for this product — callers should
 * fall back to `oldWebProductUrl` rather than guess (see `purchaseUrl`).
 */
export function wooCheckoutUrl(ref: CatalogRef, quantity = 1): string | undefined {
  const match = wooMatch(ref);
  if (!match) return undefined;
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const url = new URL(`${OLD_WEB_BASE}/checkout/`);
  url.searchParams.set('add-to-cart', String(match.wooId));
  url.searchParams.set('quantity', String(qty));
  return withAttribution(url.toString());
}

/**
 * The single function Buy Now / checkout call sites should use: the precise
 * add-to-cart checkout deep-link when we have a confident Woo match (one
 * click lands the buyer on the old site's checkout, item already in cart),
 * else the existing best-effort guessed product-page link — same graceful,
 * non-dead-end fallback as before this feature existed. Both are UTM-tagged.
 */
export function purchaseUrl(ref: CatalogRef, quantity = 1): string {
  return wooCheckoutUrl(ref, quantity) ?? withAttribution(oldWebProductUrl(ref));
}
