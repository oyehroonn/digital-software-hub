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
    tagline: "Software licensing, done right.",
    url: "/",
    accent: "#cf4840",
    accentTo: "#7d1f1b",
  },
  {
    id: "virtual-sizing",
    name: "Virtual Sizing",
    wordmark: "VS",
    tagline: "Perfect-fit sizing, no returns.",
    url: "https://virtualsizing.techrealm.ai",
    accent: "#4f81bd",
    accentTo: "#22364f",
  },
  {
    id: "virtual-try-on",
    name: "Virtual Try-On",
    wordmark: "VTO",
    tagline: "See it on you before you buy.",
    url: "https://virtualtryon.techrealm.ai",
    accent: "#8b5cf6",
    accentTo: "#3b2564",
  },
  {
    id: "pointblank",
    name: "Pointblank",
    wordmark: "PB",
    tagline: "Precision analytics for teams.",
    url: "https://pointblank.techrealm.ai",
    accent: "#e5b13a",
    accentTo: "#6b4f12",
  },
  {
    id: "preservemy-world",
    name: "PreserveMy.World",
    wordmark: "PMW",
    tagline: "Your memories, kept forever.",
    url: "https://preservemy.world",
    accent: "#10b981",
    accentTo: "#0b4c3a",
  },
  {
    id: "vpo",
    name: "VPO",
    wordmark: "VPO",
    tagline: "Virtual project operations.",
    url: "https://vpo.techrealm.ai",
    accent: "#0ea5e9",
    accentTo: "#0a3b52",
  },
  {
    id: "techrealm",
    name: "TechRealm",
    wordmark: "TR",
    tagline: "The studio behind the tools.",
    url: "https://techrealm.ai",
    accent: "#6366f1",
    accentTo: "#282a63",
  },
  {
    id: "logicpacks",
    name: "LogicPacks",
    wordmark: "LP",
    tagline: "Automation building blocks.",
    url: "https://logicpacks.com",
    accent: "#f97316",
    accentTo: "#6e3410",
  },
  {
    id: "lazyware",
    name: "Lazyware",
    wordmark: "LW",
    tagline: "Software that runs itself.",
    url: "https://lazyware.techrealm.ai",
    accent: "#14b8a6",
    accentTo: "#0c4f49",
  },
  {
    id: "bringit",
    name: "Bringit",
    wordmark: "BI",
    tagline: "Delivery, sorted.",
    url: "https://bringit.techrealm.ai",
    accent: "#ef4444",
    accentTo: "#661f1f",
  },
  {
    id: "flyaquab",
    name: "FlyAquab",
    wordmark: "FA",
    tagline: "Book smarter travel.",
    url: "https://flyaquab.com",
    accent: "#06b6d4",
    accentTo: "#0a4653",
  },
  {
    id: "apex",
    name: "Apex",
    wordmark: "APX",
    tagline: "Performance at the peak.",
    url: "https://apex.techrealm.ai",
    accent: "#a3a3a3",
    accentTo: "#3f3f46",
  },
  {
    id: "ummah-directory",
    name: "Ummah Directory",
    wordmark: "UD",
    tagline: "Your community, connected.",
    url: "https://ummahdirectory.com",
    accent: "#22c55e",
    accentTo: "#14532d",
  },
];
