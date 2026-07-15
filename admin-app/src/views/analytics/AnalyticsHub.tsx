/**
 * AnalyticsHub — the Analytics & Heatmaps area as one screen with a sub-nav.
 *
 * A single component the app shell can drop behind one nav entry; it hosts every
 * analytics lens (heatmaps, scroll, attention, funnel, rage clicks, search,
 * leaderboard, attribution, realtime, drop-off) AND the new Shopify-parity
 * report suite (Sales / Sessions / Conversion / Customers / Marketing / Products
 * / Finances), a Live visitor view and a free-form Query builder — as sub-tabs.
 *
 * The whole area is wrapped once in:
 *   • <DateRangeProvider>  — the GLOBAL date-range + compare spine. The
 *     <DateRangeControls/> toolbar at the top drives every report's window and
 *     vs-previous deltas at once.
 *   • <DrillDownProvider>  — the click-to-drill slide-over. Report tables use
 *     <DrillLink> to open product / page / customer / campaign detail lenses,
 *     each of which also respects the global date range.
 *
 * Each tab is a self-contained `{ config }` view that fetches live telemetry with
 * the deterministic seed fallback, so the whole area works before the read
 * endpoint is deployed.
 */
import { useState, type ComponentType } from "react";
import {
  Activity,
  BarChart3,
  DollarSign,
  Eye,
  Flame,
  Gauge,
  Globe,
  Grid3x3,
  Layers,
  LogOut,
  Megaphone,
  Monitor,
  MousePointer2,
  MoveVertical,
  Package,
  Percent,
  Radio,
  Route,
  Search,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { ClickHeatmapView } from "./ClickHeatmapView";
import { ScrollDepthView } from "./ScrollDepthView";
import { AttentionMapView } from "./AttentionMapView";
import { ConversionFunnelView } from "./ConversionFunnelView";
import { RageClicksView } from "./RageClicksView";
import { SearchQueriesView } from "./SearchQueriesView";
import { ViewToBuyView } from "./ViewToBuyView";
import { AttributionView } from "./AttributionView";
import { RealtimeFeedView } from "./RealtimeFeedView";
import { DropOffIndexView } from "./DropOffIndexView";
// Rich analytics suite — new full-width, graph-heavy pages.
import { AnalyticsOverview } from "./AnalyticsOverview";
import { HeatmapOverlay } from "./HeatmapOverlay";
import { GeoAnalytics } from "./GeoAnalytics";
import { UtmCampaigns } from "./UtmCampaigns";
import { Acquisition } from "./Acquisition";
import { BehaviorFlow } from "./BehaviorFlow";
import { DevicesTech } from "./DevicesTech";
// Live visitor view + free-form query builder.
import { LiveView } from "./LiveView";
import { QueryBuilder } from "./QueryBuilder";
// Global date-range spine + click-to-drill system.
import { DateRangeProvider, DateRangeControls } from "./reports/dateRange";
import { DrillDownProvider } from "./drilldown";
// Shopify-parity reports (each reads the global range + shows vs-previous).
import {
  SalesReports,
  SessionsBehaviorReport,
  ConversionReport,
  CustomersOverview,
  CustomersCohorts,
  CustomersRFM,
  MarketingReport,
  ProductsReport,
  FinancesReport,
} from "./reports";

type Group =
  | "Overview"
  | "Reports"
  | "Customers"
  | "Live & tools"
  | "Heatmaps"
  | "Conversion"
  | "Acquisition"
  | "Audience";

interface Tab {
  key: string;
  label: string;
  icon: typeof Flame;
  group: Group;
  Component: ComponentType<{ config: AppConfig }>;
}

export const ANALYTICS_TABS: Tab[] = [
  { key: "overview", label: "Overview", icon: Gauge, group: "Overview", Component: AnalyticsOverview },

  // Shopify-parity report suite — all driven by the global date-range toolbar.
  { key: "r-sales", label: "Sales", icon: DollarSign, group: "Reports", Component: SalesReports },
  { key: "r-sessions", label: "Sessions", icon: MousePointer2, group: "Reports", Component: SessionsBehaviorReport },
  { key: "r-conversion", label: "Conversion", icon: Percent, group: "Reports", Component: ConversionReport },
  { key: "r-marketing", label: "Marketing", icon: TrendingUp, group: "Reports", Component: MarketingReport },
  { key: "r-products", label: "Products", icon: Package, group: "Reports", Component: ProductsReport },
  { key: "r-finances", label: "Finances", icon: Wallet, group: "Reports", Component: FinancesReport },

  // Customer analytics — overview + cohort retention + RFM segmentation.
  { key: "c-overview", label: "Customers", icon: Users, group: "Customers", Component: CustomersOverview },
  { key: "c-cohorts", label: "Cohorts", icon: Grid3x3, group: "Customers", Component: CustomersCohorts },
  { key: "c-rfm", label: "RFM", icon: Target, group: "Customers", Component: CustomersRFM },

  // Live feed + free-form query.
  { key: "live", label: "Live", icon: Activity, group: "Live & tools", Component: LiveView },
  { key: "realtime", label: "Real-time feed", icon: Radio, group: "Live & tools", Component: RealtimeFeedView },
  { key: "query", label: "Query builder", icon: SlidersHorizontal, group: "Live & tools", Component: QueryBuilder },

  { key: "overlay", label: "Heatmap overlay", icon: Flame, group: "Heatmaps", Component: HeatmapOverlay },
  { key: "click", label: "Click heatmap", icon: Flame, group: "Heatmaps", Component: ClickHeatmapView },
  { key: "scroll", label: "Scroll depth", icon: MoveVertical, group: "Heatmaps", Component: ScrollDepthView },
  { key: "attention", label: "Attention", icon: Eye, group: "Heatmaps", Component: AttentionMapView },
  { key: "rage", label: "Rage clicks", icon: Zap, group: "Heatmaps", Component: RageClicksView },

  { key: "funnel", label: "Funnel", icon: Layers, group: "Conversion", Component: ConversionFunnelView },
  { key: "flow", label: "Behavior flow", icon: Route, group: "Conversion", Component: BehaviorFlow },
  { key: "leaderboard", label: "View→Buy", icon: Trophy, group: "Conversion", Component: ViewToBuyView },
  { key: "dropoff", label: "Drop-off", icon: LogOut, group: "Conversion", Component: DropOffIndexView },

  { key: "acquisition", label: "Acquisition", icon: Target, group: "Acquisition", Component: Acquisition },
  { key: "utm", label: "UTM & campaigns", icon: Megaphone, group: "Acquisition", Component: UtmCampaigns },
  { key: "search", label: "Search", icon: Search, group: "Acquisition", Component: SearchQueriesView },
  { key: "attribution", label: "Attribution", icon: Radio, group: "Acquisition", Component: AttributionView },

  { key: "geo", label: "Geo", icon: Globe, group: "Audience", Component: GeoAnalytics },
  { key: "devices", label: "Devices", icon: Monitor, group: "Audience", Component: DevicesTech },
];

const GROUP_ORDER: Group[] = [
  "Overview",
  "Reports",
  "Customers",
  "Live & tools",
  "Heatmaps",
  "Conversion",
  "Acquisition",
  "Audience",
];

function AnalyticsHubInner({ config, initialTab }: { config: AppConfig; initialTab?: string }) {
  const [active, setActive] = useState(initialTab ?? ANALYTICS_TABS[0].key);
  const current = ANALYTICS_TABS.find((t) => t.key === active) ?? ANALYTICS_TABS[0];
  const Active = current.Component;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="h-5 w-5 text-primary" /> Analytics
          </h1>
          <p className="max-w-3xl text-xs text-muted-foreground">
            Shopify-parity reporting on the stable Telemetry &amp; Orders sheets — an executive
            overview, a full Sales / Sessions / Conversion / Customers / Marketing / Products /
            Finances report suite, cohort &amp; RFM segmentation, a live visitor view, a free-form
            query builder, and the visual heatmap / funnel lenses. Every report respects the date
            range below and shows vs-previous deltas; rows drill into detail. Falls back to seed
            data until the read endpoint is deployed.
          </p>
        </div>
        {/* The GLOBAL date-range + compare toolbar — re-scopes every report at once. */}
        <DateRangeControls className="shrink-0" />
      </div>

      {/* Sub-nav grouped by theme */}
      <div className="flex flex-col gap-2 border-b border-border pb-3">
        {GROUP_ORDER.map((group) => {
          const tabs = ANALYTICS_TABS.filter((t) => t.group === group);
          if (!tabs.length) return null;
          return (
            <div key={group} className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                {group}
              </span>
              {tabs.map((t) => {
                const Icon = t.icon;
                const on = t.key === active;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActive(t.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      on
                        ? "border-primary/40 bg-primary/15 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Remount on tab change so each view's data hook / clock resets cleanly. */}
      <Active key={current.key} config={config} />
    </div>
  );
}

export function AnalyticsHub({ config, initialTab }: { config: AppConfig; initialTab?: string }) {
  // One provider pair for the whole area: the date-range spine drives every
  // report's window + deltas, and the drill-down host powers <DrillLink> rows.
  return (
    <DateRangeProvider>
      <DrillDownProvider config={config}>
        <AnalyticsHubInner config={config} initialTab={initialTab} />
      </DrillDownProvider>
    </DateRangeProvider>
  );
}
