/**
 * Central navigation model for the DSM admin app.
 *
 * ONE source of truth for the whole information architecture:
 *   • the top-level SECTIONS shown in the sidebar (grouped, icon'd, role-gated),
 *   • each section's PAGES shown as a secondary nav / sub-tab bar,
 *   • how each section renders its active page (delegating to the existing hubs,
 *     which are refactored to a *controlled* mode so the shell owns the sub-nav),
 *   • the data needed to build breadcrumbs and the ⌘K command palette.
 *
 * Role gating stays intact: a page is visible when its `perm` (or the section's
 * `perm`) is granted; a section is visible when it has at least one visible page
 * (single-page sections gate on their own perm). Nothing is removed — every
 * existing feature is reachable, just organised.
 */
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Bot,
  Boxes,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  Copy,
  DollarSign,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Flame,
  Gauge,
  Globe,
  HeartPulse,
  Inbox,
  KanbanSquare,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Megaphone,
  MonitorDown,
  Newspaper,
  Pencil,
  Repeat,
  Search,
  Send,
  Settings2,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Tag,
  Target,
  Ticket,
  TrendingUp,
  UserMinus,
  Users,
  Wand2,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { ServiceStatus } from "@/lib/health";
import type { Permission, RoleKey } from "@/lib/roles";
import { roleGrants } from "@/lib/roles";

// Section content hosts (all refactored to accept controlled page/onPageChange).
import { AnalyticsHub } from "@/views/analytics";
import { CatalogView } from "@/views/catalog/CatalogView";
import OrdersFulfillment from "@/views/orders";
import { CrmView } from "@/views/crm/CrmView";
import { MarketingView } from "@/views/marketing/MarketingView";
import { AiView } from "@/views/ai/AiView";
import { OpsView } from "@/views/ops/OpsView";
import { SettingsView } from "@/views/SettingsView";
import { DashboardView } from "@/views/dashboard/DashboardView";
import { ApprovalsView } from "@/views/approvals/ApprovalsView";
import { DesktopAppView } from "@/views/system/DesktopAppView";

export type LucideIcon = typeof Boxes;

/** Context handed to every section render + to the dashboard / overviews. */
export interface NavCtx {
  config: AppConfig;
  vpsUp: boolean;
  statuses: ServiceStatus[];
  queueCount: number;
  onSavedConfig: (c: AppConfig) => void;
  section: Section;
  /** Active page key within the section (never "overview" inside render()). */
  page: string;
  /** Change the active page within the current section. */
  setPage: (key: string) => void;
  /** Jump anywhere: section (and optional page) — used by ⌘K, tiles, cards. */
  goto: (sectionKey: string, pageKey?: string) => void;
}

export interface NavPage {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Optional per-page gate; falls back to the section's perm. */
  perm?: Permission;
  /** One-liner shown on the section-overview card. */
  desc?: string;
  /** Extra ⌘K search terms. */
  keywords?: string;
}

export interface Section {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Sidebar collapsible group. */
  group: string;
  /** Gate for the whole section (single-page sections gate on this). */
  perm?: Permission;
  /** Shown on the section overview + ⌘K. */
  blurb: string;
  /** Single-page sections (Dashboard, Settings) have no secondary nav / overview. */
  singlePage?: boolean;
  /** When true the section renders its own "overview" page (Analytics does). */
  customOverview?: boolean;
  pages: NavPage[];
  render: (ctx: NavCtx) => JSX.Element;
}

export const OVERVIEW_PAGE: NavPage = {
  key: "overview",
  label: "Overview",
  icon: LayoutDashboard,
  desc: "Section summary and shortcuts.",
};

/* ------------------------------------------------------------------ sections */

export const SIDEBAR_GROUPS = ["Main", "Analyze", "Commerce", "Growth", "System"] as const;

export const SECTIONS: Section[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    group: "Main",
    blurb: "Today's KPIs, recent orders and backend health at a glance.",
    singlePage: true,
    pages: [],
    render: (ctx) => <DashboardView ctx={ctx} />,
  },

  {
    key: "analytics",
    label: "Analytics",
    icon: BarChart3,
    group: "Analyze",
    perm: "analytics.view",
    blurb:
      "Shopify-parity reporting, cohort & RFM segmentation, a live visitor view, a query builder and the visual heatmap / funnel lenses.",
    customOverview: true,
    pages: [
      { key: "reports", label: "Reports", icon: DollarSign, desc: "Sales, sessions, conversion, marketing, products & finances.", keywords: "sales sessions conversion finances products" },
      { key: "customers", label: "Customers", icon: Users, desc: "Customer overview, cohort retention & RFM segmentation.", keywords: "cohorts rfm retention" },
      { key: "live", label: "Live & tools", icon: Activity, desc: "Live visitor view, real-time feed and the free-form query builder.", keywords: "realtime query builder" },
      { key: "heatmaps", label: "Heatmaps", icon: Flame, desc: "Click, scroll, attention overlays and rage clicks.", keywords: "click scroll attention rage overlay" },
      { key: "conversion", label: "Conversion", icon: Target, desc: "Funnels, behavior flow, view-to-buy and drop-off.", keywords: "funnel flow dropoff view to buy" },
      { key: "acquisition", label: "Acquisition", icon: Megaphone, desc: "Acquisition, UTM & campaigns, search and attribution.", keywords: "utm campaigns search attribution" },
      { key: "audience", label: "Audience", icon: Globe, desc: "Geography and devices / technology.", keywords: "geo devices tech" },
    ],
    render: (ctx) => (
      <AnalyticsHub config={ctx.config} category={ctx.page} onCategoryChange={ctx.setPage} />
    ),
  },

  {
    key: "catalog",
    label: "Catalog",
    icon: Boxes,
    group: "Commerce",
    perm: "products.view",
    blurb: "Products, pricing, stock, 3D coverage, SEO, bundles and cleanup tools.",
    pages: [
      { key: "editor", label: "Editor", icon: Pencil, desc: "Edit products, price & stock." },
      { key: "bulk", label: "Bulk & import", icon: FileSpreadsheet, desc: "Bulk edits and spreadsheet import/export." },
      { key: "stock", label: "Stock alerts", icon: AlertTriangle, desc: "Low-stock and out-of-stock watchlist." },
      { key: "pricing", label: "Pricing audit", icon: Tag, desc: "Margin and price-consistency auditing." },
      { key: "coverage", label: "3D coverage", icon: Boxes, desc: "3D box-model coverage across the catalog." },
      { key: "performance", label: "Performance", icon: Award, desc: "Per-product performance scoring." },
      { key: "trending", label: "Trending", icon: Flame, desc: "Fast-movers from live telemetry." },
      { key: "duplicates", label: "Duplicates", icon: Copy, desc: "Find and merge duplicate listings." },
      { key: "seo", label: "SEO", icon: Search, desc: "Titles, meta and structured SEO." },
      { key: "bundles", label: "Bundles", icon: Wand2, desc: "Build product bundles." },
    ],
    render: (ctx) => (
      <CatalogView config={ctx.config} vpsUp={ctx.vpsUp} page={ctx.page} onPageChange={ctx.setPage} />
    ),
  },

  {
    key: "orders",
    label: "Orders",
    icon: ClipboardList,
    group: "Commerce",
    perm: "orders.view",
    blurb: "Pipeline, quotes, cart recovery, fulfillment, refunds and repeat buyers.",
    pages: [
      { key: "pipeline", label: "Pipeline", icon: KanbanSquare, desc: "Kanban order pipeline." },
      { key: "quotes", label: "Quote desk", icon: FileText, desc: "Compose and track quotes." },
      { key: "abandoned", label: "Abandoned carts", icon: ShoppingCart, desc: "Recover abandoned checkouts." },
      { key: "trends", label: "Trends", icon: TrendingUp, desc: "Order volume and value trends." },
      { key: "fulfillment", label: "Fulfillment", icon: KeyRound, desc: "License / delivery fulfillment." },
      { key: "refunds", label: "Refunds", icon: LifeBuoy, desc: "Refund log and handling." },
      { key: "repeat", label: "Repeat buyers", icon: Repeat, desc: "Repeat-purchase growth." },
    ],
    render: (ctx) => (
      <OrdersFulfillment config={ctx.config} page={ctx.page} onPageChange={ctx.setPage} />
    ),
  },

  {
    key: "approvals",
    label: "Approvals",
    icon: ShieldCheck,
    group: "Commerce",
    perm: "orders.view",
    blurb:
      "Decision desk for site quote & order requests — price, approve to create the DSM Exclusive Member account and email the quote, or reject.",
    singlePage: true,
    pages: [],
    render: (ctx) => <ApprovalsView config={ctx.config} />,
  },

  {
    key: "customers",
    label: "Customers",
    icon: Users,
    group: "Commerce",
    perm: "customers.view",
    blurb: "Unified lead inbox, site-lead aggregation, scoring, customer 360, licences, segments & win-back.",
    pages: [
      { key: "inbox", label: "Lead inbox", icon: Inbox, desc: "Unified inbox of inbound leads." },
      { key: "siteleads", label: "Site leads", icon: Share2, desc: "Every email the site captured, grouped by contact & source.", keywords: "footer popup reseller quote savings callback newsletter aggregation" },
      { key: "scoring", label: "Scoring", icon: Gauge, desc: "Lead scoring and grades." },
      { key: "customers", label: "Customer 360", icon: Users, desc: "Full customer profiles." },
      { key: "licenses", label: "Licences", icon: KeyRound, desc: "License renewals tracker." },
      { key: "segments", label: "Segments", icon: Boxes, desc: "Build customer segments." },
      { key: "tasks", label: "Follow-ups", icon: CheckSquare, desc: "Follow-up tasks." },
      { key: "winback", label: "Win-back", icon: Repeat, desc: "Re-engage lapsed customers." },
    ],
    render: (ctx) => (
      <CrmView config={ctx.config} page={ctx.page} onPageChange={ctx.setPage} />
    ),
  },

  {
    key: "marketing",
    label: "Marketing",
    icon: Megaphone,
    group: "Growth",
    perm: "marketing.blast",
    blurb: "Campaigns, blasts, discounts, A/B tests, scheduling, referrals & landing pages.",
    pages: [
      { key: "campaigns", label: "Campaigns", icon: Megaphone, desc: "Plan and track campaigns." },
      { key: "blast", label: "Blast", icon: Send, desc: "Compose email blasts." },
      { key: "discounts", label: "Discounts", icon: Ticket, desc: "Discount codes and rules." },
      { key: "abtests", label: "A/B tests", icon: FlaskConical, desc: "Experiment tracking." },
      { key: "scheduler", label: "Scheduler", icon: CalendarClock, desc: "Schedule sends." },
      { key: "referrals", label: "Referrals", icon: Share2, desc: "Referral program." },
      { key: "landing", label: "Landing pages", icon: Globe, desc: "Compare landing pages." },
      { key: "sendlog", label: "Send log", icon: Mail, desc: "History of sends." },
    ],
    render: (ctx) => (
      <MarketingView config={ctx.config} page={ctx.page} onPageChange={ctx.setPage} />
    ),
  },

  {
    key: "ai",
    label: "AI",
    icon: Bot,
    group: "Growth",
    blurb: "AI-assisted selling — daily briefing, lead summaries, SEO generation & churn.",
    pages: [
      { key: "briefing", label: "Daily briefing", icon: Newspaper, desc: "AI daily sales briefing." },
      { key: "leads", label: "Lead summaries", icon: FileText, desc: "AI lead summaries." },
      { key: "seo", label: "SEO generator", icon: Search, desc: "Bulk AI SEO generation." },
      { key: "churn", label: "Churn predictor", icon: UserMinus, desc: "Predict at-risk customers." },
    ],
    render: (ctx) => <AiView config={ctx.config} page={ctx.page} onPageChange={ctx.setPage} />,
  },

  {
    key: "ops",
    label: "Ops",
    icon: HeartPulse,
    group: "System",
    blurb: "Backend health, incident log, the offline edit queue and role management.",
    pages: [
      { key: "health", label: "Health board", icon: HeartPulse, perm: "ops.health", desc: "Backend health & incidents." },
      { key: "roles", label: "Roles & access", icon: ShieldCheck, perm: "roles.manage", desc: "Manage roles and access." },
    ],
    render: (ctx) => <OpsView config={ctx.config} page={ctx.page} onPageChange={ctx.setPage} />,
  },

  {
    key: "desktop",
    label: "Desktop App",
    icon: MonitorDown,
    group: "System",
    blurb: "Install the DSM Admin desktop app (macOS & Windows), what it adds, and the build & docs.",
    singlePage: true,
    pages: [],
    render: (ctx) => <DesktopAppView config={ctx.config} />,
  },

  {
    key: "settings",
    label: "Settings",
    icon: Settings2,
    group: "System",
    perm: "settings.manage",
    blurb: "App configuration and connection settings.",
    singlePage: true,
    pages: [],
    render: (ctx) => <SettingsView config={ctx.config} onSaved={ctx.onSavedConfig} />,
  },
];

export const SECTION_MAP: Record<string, Section> = Object.fromEntries(
  SECTIONS.map((s) => [s.key, s]),
);

/* -------------------------------------------------------------- role gating */

/** Pages of a section visible to `role` (excludes the injected Overview page). */
export function visiblePages(section: Section, role: RoleKey): NavPage[] {
  const grants = roleGrants(role);
  return section.pages.filter((p) => {
    const perm = p.perm ?? section.perm;
    return !perm || grants.has(perm);
  });
}

/** The full sub-nav for a section: Overview first, then visible pages. */
export function displayPages(section: Section, role: RoleKey): NavPage[] {
  if (section.singlePage) return [];
  return [OVERVIEW_PAGE, ...visiblePages(section, role)];
}

/** Is a section visible at all for this role? */
export function sectionVisible(section: Section, role: RoleKey): boolean {
  const grants = roleGrants(role);
  if (section.singlePage) return !section.perm || grants.has(section.perm);
  if (section.perm && !grants.has(section.perm)) return false;
  return visiblePages(section, role).length > 0;
}

export function visibleSections(role: RoleKey): Section[] {
  return SECTIONS.filter((s) => sectionVisible(s, role));
}

/** Default landing page key for a section (Overview when it has a sub-nav). */
export function defaultPageOf(section: Section, role: RoleKey): string {
  if (section.singlePage) return "";
  const pages = displayPages(section, role);
  return pages[0]?.key ?? "overview";
}

/* ------------------------------------------------------------- ⌘K search */

export interface SearchEntry {
  sectionKey: string;
  pageKey?: string;
  label: string;
  section: string;
  icon: LucideIcon;
  keywords: string;
}

/** Flat, role-filtered index of every reachable place for the command palette. */
export function searchIndex(role: RoleKey): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const s of visibleSections(role)) {
    out.push({
      sectionKey: s.key,
      label: s.label,
      section: s.group,
      icon: s.icon,
      keywords: `${s.label} ${s.group} ${s.blurb}`.toLowerCase(),
    });
    for (const p of displayPages(s, role)) {
      if (p.key === "overview") continue;
      out.push({
        sectionKey: s.key,
        pageKey: p.key,
        label: p.label,
        section: s.label,
        icon: p.icon,
        keywords: `${s.label} ${p.label} ${p.desc ?? ""} ${p.keywords ?? ""}`.toLowerCase(),
      });
    }
  }
  return out;
}
