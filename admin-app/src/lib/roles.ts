/**
 * Role-Based Access Control (RBAC) for the DSM admin app.
 *
 * Defines the seven operating roles (admin, marketing, fleet, finance, area,
 * ops, data), a flat permission vocabulary, per-region data scoping, and a
 * gated navigation config. The current session (active role + region scope) is
 * persisted to localStorage and exposed via a tiny subscribe store + React hook
 * so the header switcher, the nav, and every view stay in lockstep.
 *
 * This is an operator-convenience access layer (who sees what in this desktop
 * shell), NOT a security boundary — the STABLE Apps Script secret still gates
 * the real data reads. It keeps finance-only revenue away from an area manager's
 * screen, scopes an area manager to their region, and hides destructive catalog
 * controls from read-only roles.
 */
import { useEffect, useState } from "react";

/* --------------------------------- Roles --------------------------------- */

export type RoleKey =
  | "admin"
  | "marketing"
  | "fleet"
  | "finance"
  | "area"
  | "ops"
  | "data";

/** Every gated capability in the app. Views check these, never the raw role. */
export type Permission =
  | "products.view"
  | "products.edit"
  | "products.regen"
  | "orders.view"
  | "orders.pii" // see customer name / email / phone / address
  | "orders.export"
  | "customers.view"
  | "analytics.view"
  | "heatmaps.view"
  | "marketing.blast" // send email blasts / quotes
  | "finance.revenue" // see money figures (revenue, price totals)
  | "fleet.manage" // device / license fleet controls
  | "ops.health"
  | "queue.manage" // push / discard offline edit queue
  | "roles.manage"
  | "settings.manage";

export interface PermissionMeta {
  key: Permission;
  label: string;
  group: "Catalog" | "Sales" | "Analytics" | "Growth" | "Finance" | "Operations";
  sensitive?: boolean;
}

export const PERMISSIONS: PermissionMeta[] = [
  { key: "products.view", label: "View catalog", group: "Catalog" },
  { key: "products.edit", label: "Edit price & stock", group: "Catalog" },
  { key: "products.regen", label: "Trigger 3D box regen", group: "Catalog" },
  { key: "orders.view", label: "View orders", group: "Sales" },
  { key: "orders.pii", label: "See customer PII", group: "Sales", sensitive: true },
  { key: "orders.export", label: "Export orders", group: "Sales", sensitive: true },
  { key: "customers.view", label: "View customers & licenses", group: "Sales" },
  { key: "analytics.view", label: "View analytics & funnel", group: "Analytics" },
  { key: "heatmaps.view", label: "View scroll / look maps", group: "Analytics" },
  { key: "marketing.blast", label: "Send blasts & quotes", group: "Growth", sensitive: true },
  { key: "finance.revenue", label: "See revenue figures", group: "Finance", sensitive: true },
  { key: "fleet.manage", label: "Manage device fleet", group: "Operations" },
  { key: "ops.health", label: "View health board", group: "Operations" },
  { key: "queue.manage", label: "Push / discard queue", group: "Operations" },
  { key: "roles.manage", label: "Manage roles & access", group: "Operations", sensitive: true },
  { key: "settings.manage", label: "Edit app settings", group: "Operations", sensitive: true },
];

export interface RoleDef {
  key: RoleKey;
  label: string;
  blurb: string;
  /** true = every permission (super-user). Otherwise `grants` is authoritative. */
  all?: boolean;
  grants: Permission[];
  /** area managers are region-scoped by default; everyone else defaults global. */
  regionScoped?: boolean;
  accent: "primary" | "ok" | "warn" | "down" | "muted";
}

/** null grants means "all" is honoured; otherwise the explicit list applies. */
export const ROLES: RoleDef[] = [
  {
    key: "admin",
    label: "Administrator",
    blurb: "Full control across every area and region. Nothing is hidden.",
    all: true,
    grants: [],
    accent: "primary",
  },
  {
    key: "marketing",
    label: "Marketing",
    blurb: "Growth & campaigns — analytics, heatmaps, blasts and quotes.",
    grants: [
      "products.view",
      "analytics.view",
      "heatmaps.view",
      "customers.view",
      "marketing.blast",
      "orders.view",
    ],
    accent: "warn",
  },
  {
    key: "fleet",
    label: "Fleet",
    blurb: "Device & license fleet operations plus catalog upkeep.",
    grants: [
      "products.view",
      "products.edit",
      "products.regen",
      "fleet.manage",
      "ops.health",
      "queue.manage",
    ],
    accent: "ok",
  },
  {
    key: "finance",
    label: "Finance",
    blurb: "Revenue, orders and customer accounts. No catalog edits.",
    grants: [
      "orders.view",
      "orders.pii",
      "orders.export",
      "customers.view",
      "finance.revenue",
      "analytics.view",
    ],
    accent: "primary",
  },
  {
    key: "area",
    label: "Area manager",
    blurb: "Region-scoped view of orders, customers and analytics.",
    grants: [
      "products.view",
      "orders.view",
      "orders.pii",
      "customers.view",
      "analytics.view",
      "heatmaps.view",
    ],
    regionScoped: true,
    accent: "muted",
  },
  {
    key: "ops",
    label: "Operations",
    blurb: "Backend health, incident log and the offline edit queue.",
    grants: [
      "products.view",
      "ops.health",
      "queue.manage",
      "analytics.view",
      "settings.manage",
    ],
    accent: "ok",
  },
  {
    key: "data",
    label: "Data / analyst",
    blurb: "Read-only analytics, heatmaps and anonymised orders.",
    grants: ["analytics.view", "heatmaps.view", "orders.view", "products.view"],
    accent: "muted",
  },
];

export const ROLE_MAP: Record<RoleKey, RoleDef> = Object.fromEntries(
  ROLES.map((r) => [r.key, r]),
) as Record<RoleKey, RoleDef>;

export function roleGrants(role: RoleKey): Set<Permission> {
  const def = ROLE_MAP[role];
  if (!def) return new Set();
  if (def.all) return new Set(PERMISSIONS.map((p) => p.key));
  return new Set(def.grants);
}

export function roleHas(role: RoleKey, perm: Permission): boolean {
  return roleGrants(role).has(perm);
}

/* -------------------------------- Regions -------------------------------- */

export type RegionKey = "global" | "me" | "apac" | "emea" | "amer";

export interface RegionDef {
  key: RegionKey;
  label: string;
  /** lowercase country tokens that map into this region (substring match). */
  countries: string[];
}

export const REGIONS: RegionDef[] = [
  { key: "global", label: "Global (all regions)", countries: [] },
  {
    key: "me",
    label: "Middle East",
    countries: [
      "united arab emirates", "uae", "u.a.e", "saudi", "ksa", "qatar", "kuwait",
      "bahrain", "oman", "jordan", "egypt", "lebanon", "iraq",
    ],
  },
  {
    key: "apac",
    label: "Asia-Pacific",
    countries: [
      "australia", "new zealand", "singapore", "india", "malaysia", "indonesia",
      "japan", "china", "hong kong", "philippines", "thailand", "vietnam", "korea",
    ],
  },
  {
    key: "emea",
    label: "Europe & Africa",
    countries: [
      "united kingdom", "uk", "england", "ireland", "germany", "france", "spain",
      "italy", "netherlands", "belgium", "sweden", "norway", "poland", "portugal",
      "switzerland", "austria", "south africa", "nigeria", "kenya",
    ],
  },
  {
    key: "amer",
    label: "Americas",
    countries: [
      "united states", "usa", "u.s", "america", "canada", "mexico", "brazil",
      "argentina", "chile", "colombia", "peru",
    ],
  },
];

export const REGION_MAP: Record<RegionKey, RegionDef> = Object.fromEntries(
  REGIONS.map((r) => [r.key, r]),
) as Record<RegionKey, RegionDef>;

/** Map a free-text country string onto a region. Falls back to `global`. */
export function regionForCountry(country?: string | null): RegionKey {
  const c = String(country ?? "").trim().toLowerCase();
  if (!c) return "global";
  for (const r of REGIONS) {
    if (r.key === "global") continue;
    if (r.countries.some((tok) => c.includes(tok))) return r.key;
  }
  return "global";
}

/** True if a row from `country` is visible under the active region scope. */
export function inRegionScope(scope: RegionKey, country?: string | null): boolean {
  if (scope === "global") return true;
  const rc = regionForCountry(country);
  // Unknown/global-mapped countries stay visible so nothing silently vanishes;
  // a matched foreign region is filtered out.
  return rc === "global" || rc === scope;
}

/* ----------------------------- Gated nav config -------------------------- */

/** Mirrors the shell tabs; `perm` gates visibility. Order = display order. */
export interface NavItem {
  key: string;
  label: string;
  perm: Permission;
}

export const NAV_CONFIG: NavItem[] = [
  { key: "products", label: "Products", perm: "products.view" },
  { key: "orders", label: "Orders", perm: "orders.view" },
  { key: "customers", label: "Customers", perm: "customers.view" },
  { key: "analytics", label: "Analytics", perm: "analytics.view" },
  { key: "scroll", label: "Scroll map", perm: "heatmaps.view" },
  { key: "look", label: "Look map", perm: "heatmaps.view" },
  { key: "marketing", label: "Marketing", perm: "marketing.blast" },
  { key: "fleet", label: "Fleet", perm: "fleet.manage" },
  { key: "health", label: "Health", perm: "ops.health" },
  { key: "roles", label: "Roles & access", perm: "roles.manage" },
  { key: "settings", label: "Settings", perm: "settings.manage" },
];

/** Tabs this role may see. Admin sees everything. */
export function visibleNav(role: RoleKey): NavItem[] {
  const grants = roleGrants(role);
  return NAV_CONFIG.filter((n) => grants.has(n.perm));
}

/**
 * Filter an arbitrary tab list (e.g. App.tsx's TABS) by the active role. Any tab
 * whose key isn't in NAV_CONFIG is treated as always-visible so the integration
 * step can't accidentally hide a tab the RBAC map doesn't know about yet.
 */
export function filterTabsByRole<T extends { key: string }>(tabs: T[], role: RoleKey): T[] {
  const grants = roleGrants(role);
  const gate = new Map(NAV_CONFIG.map((n) => [n.key, n.perm] as const));
  return tabs.filter((t) => {
    const perm = gate.get(t.key);
    return perm ? grants.has(perm) : true;
  });
}

/* ------------------------------ Session store ---------------------------- */

export interface Session {
  role: RoleKey;
  region: RegionKey;
}

const LS_KEY = "dsm-admin.session";
const DEFAULT_SESSION: Session = { role: "admin", region: "global" };

type Listener = (s: Session) => void;
const listeners = new Set<Listener>();

function read(): Session {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_SESSION;
    const p = JSON.parse(raw) as Partial<Session>;
    const role = ROLE_MAP[p.role as RoleKey] ? (p.role as RoleKey) : DEFAULT_SESSION.role;
    let region = REGION_MAP[p.region as RegionKey] ? (p.region as RegionKey) : DEFAULT_SESSION.region;
    // An area manager pinned to global is meaningless — default them to a region.
    if (ROLE_MAP[role].regionScoped && region === "global") region = "me";
    return { role, region };
  } catch {
    return DEFAULT_SESSION;
  }
}

function write(s: Session) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota / private-mode failures */
  }
  listeners.forEach((l) => l(s));
}

export function getSession(): Session {
  return read();
}

export function setRole(role: RoleKey) {
  const cur = read();
  const def = ROLE_MAP[role];
  const region = def?.regionScoped && cur.region === "global" ? "me" : cur.region;
  write({ role, region });
}

export function setRegion(region: RegionKey) {
  write({ ...read(), region });
}

export function subscribeSession(fn: Listener): () => void {
  listeners.add(fn);
  fn(read());
  return () => {
    listeners.delete(fn);
  };
}

/** React hook — re-renders on any role/region change from anywhere in the app. */
export function useSession(): Session {
  const [s, setS] = useState<Session>(getSession);
  useEffect(() => subscribeSession(setS), []);
  return s;
}

/** Convenience: does the active session grant this permission? */
export function useCan(perm: Permission): boolean {
  const { role } = useSession();
  return roleHas(role, perm);
}
