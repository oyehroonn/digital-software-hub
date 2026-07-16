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
 */

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
