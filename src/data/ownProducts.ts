/**
 * Our own products, featured as DSM-style 3D boxes on the AI Lab page and the
 * home end-of-page scroll animation.
 *
 * Ordering is INTENTIONAL and load-bearing — the array order is the display
 * priority (DSM first, Ummah Directory last). Do not re-sort. Each entry links
 * to that product.
 *
 * This is a static, client-side list (no backend dependency) so the showcase
 * always renders even when the unstable VPS/LLM backends are down — it obeys
 * the resilience contract by never needing a network call.
 */

export interface OwnProduct {
  /** Short id / key. */
  id: string;
  /** Display name (box cover wordmark + label). */
  name: string;
  /** Short wordmark shown large on the box cover. */
  wordmark: string;
  /** One-line, plain-English positioning. */
  tagline: string;
  /** Where the box links to. */
  url: string;
  /** Accent colour for the box cover (any valid CSS colour). */
  accent: string;
  /** Secondary accent for the cover gradient. */
  accentTo: string;
}

// Priority order per the DSM revamp brief (index === display priority).
export const OWN_PRODUCTS: OwnProduct[] = [
  {
    id: "dsm",
    name: "DSM",
    wordmark: "DSM",
    tagline: "Genuine software licensing, instant delivery.",
    url: "/",
    accent: "#cf4840",
    accentTo: "#7d1f1b",
  },
  {
    id: "virtual-sizing",
    name: "Virtual Sizing",
    wordmark: "VS",
    tagline: "AI picks every shopper's perfect size in seconds.",
    url: "https://virtualsizing.techrealm.ai",
    accent: "#4f81bd",
    accentTo: "#22364f",
  },
  {
    id: "virtual-try-on",
    name: "Virtual Try-On",
    wordmark: "VTO",
    tagline: "See it on before you buy — no returns.",
    url: "https://virtualtryon.techrealm.ai",
    accent: "#8b5cf6",
    accentTo: "#3b2564",
  },
  {
    id: "pointblank",
    name: "Pointblank",
    wordmark: "PB",
    tagline: "AI-driven cybersecurity threat hunting.",
    url: "https://pointblank.techrealm.ai",
    accent: "#e5b13a",
    accentTo: "#6b4f12",
  },
  {
    id: "preservemy-world",
    name: "PreserveMy.World",
    wordmark: "PMW",
    tagline: "Spatial-AI 3D capture of real places.",
    url: "https://preservemy.world",
    accent: "#10b981",
    accentTo: "#0b4c3a",
  },
  {
    id: "vpo",
    name: "VPO",
    wordmark: "VPO",
    tagline: "Immersive 3D virtual shopping outlets.",
    url: "https://vpo.techrealm.ai",
    accent: "#0ea5e9",
    accentTo: "#0a3b52",
  },
  {
    id: "techrealm",
    name: "TechRealm",
    wordmark: "TR",
    tagline: "Cloud + AI platform engineered for 99.99% uptime.",
    url: "https://techrealm.ai",
    accent: "#6366f1",
    accentTo: "#282a63",
  },
  {
    id: "logicpacks",
    name: "LogicPacks",
    wordmark: "LP",
    tagline: "Drag-and-drop automation flows & dev connectors.",
    url: "https://logicpacks.com",
    accent: "#f97316",
    accentTo: "#6e3410",
  },
  {
    id: "lazyware",
    name: "Lazyware",
    wordmark: "LW",
    tagline: "Automate anything once, then forget — save ~10h/week.",
    url: "https://lazyware.techrealm.ai",
    accent: "#14b8a6",
    accentTo: "#0c4f49",
  },
  {
    id: "bringit",
    name: "Bringit",
    wordmark: "BI",
    tagline: "On-demand local delivery, done.",
    url: "https://bringit.techrealm.ai",
    accent: "#ef4444",
    accentTo: "#661f1f",
  },
  {
    id: "flyaquab",
    name: "FlyAquab",
    wordmark: "FA",
    tagline: "Autonomous drone survey & aerial data capture.",
    url: "https://flyaquab.com",
    accent: "#06b6d4",
    accentTo: "#0a4653",
  },
  {
    id: "apex",
    name: "Apex",
    wordmark: "APX",
    tagline: "Reality-capture visualization for construction.",
    url: "https://apex.techrealm.ai",
    accent: "#a3a3a3",
    accentTo: "#3f3f46",
  },
  {
    id: "ummah-directory",
    name: "Ummah Directory",
    wordmark: "UD",
    tagline: "The community business directory.",
    url: "https://ummahdirectory.com",
    accent: "#22c55e",
    accentTo: "#14532d",
  },
];

// ── Own-product detection ─────────────────────────────────────────────────────
//
// The checkout branches on WHO owns the product: DSM's OWN products (Pointblank,
// Virtual Sizing, VPO, …) route to a "book a meeting" flow with no redirect,
// while third-party LICENSING products (Microsoft, Autodesk, Corel, …) route to
// the legacy storefront to complete purchase. This helper decides which bucket a
// cart line / product id / name falls into.

const normalize = (v: unknown): string =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Precomputed lookups so detection is O(1) per item.
const OWN_ID_SET = new Set(OWN_PRODUCTS.map((p) => normalize(p.id)));
const OWN_NAME_SET = new Set(OWN_PRODUCTS.map((p) => normalize(p.name)));

/** Find the matching own-product for an id/name, or `undefined`. */
export function matchOwnProduct(
  ref: { id?: string | number; name?: string } | string | number | null | undefined,
): OwnProduct | undefined {
  if (ref == null) return undefined;
  const id = typeof ref === 'object' ? ref.id : ref;
  const name = typeof ref === 'object' ? ref.name : ref;
  const nId = normalize(id);
  const nName = normalize(name);
  return OWN_PRODUCTS.find(
    (p) =>
      (nId && (normalize(p.id) === nId || normalize(p.name) === nId)) ||
      (nName && (normalize(p.name) === nName || normalize(p.id) === nName)),
  );
}

/**
 * True when a product is one of DSM's OWN products (vs a third-party license we
 * resell). Matches on id or display name, case/punctuation-insensitively.
 */
export function isOwnProduct(
  ref: { id?: string | number; name?: string } | string | number | null | undefined,
): boolean {
  // Cheap set check first (covers exact id/name), then the fuzzy matcher.
  if (typeof ref === 'string' || typeof ref === 'number') {
    const n = normalize(ref);
    if (OWN_ID_SET.has(n) || OWN_NAME_SET.has(n)) return true;
  }
  return matchOwnProduct(ref) !== undefined;
}
