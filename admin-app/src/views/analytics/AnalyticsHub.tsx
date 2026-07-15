/**
 * AnalyticsHub — the Analytics & Heatmaps area as one screen with a sub-nav.
 *
 * A single component the app shell can drop behind one nav entry; it hosts every
 * analytics lens (heatmaps, scroll, attention, funnel, rage clicks, search,
 * leaderboard, attribution, realtime, drop-off) as sub-tabs. Each tab is a
 * self-contained view that fetches live telemetry with the deterministic seed
 * fallback, so the whole area works before the read endpoint is deployed.
 */
import { useState, type ComponentType } from "react";
import {
  Activity,
  BarChart3,
  Eye,
  Flame,
  Layers,
  LogOut,
  MoveVertical,
  Radio,
  Search,
  Trophy,
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

interface Tab {
  key: string;
  label: string;
  icon: typeof Flame;
  group: "Heatmaps" | "Conversion" | "Acquisition" | "Live";
  Component: ComponentType<{ config: AppConfig }>;
}

export const ANALYTICS_TABS: Tab[] = [
  { key: "realtime", label: "Real-time", icon: Activity, group: "Live", Component: RealtimeFeedView },
  { key: "click", label: "Click heatmap", icon: Flame, group: "Heatmaps", Component: ClickHeatmapView },
  { key: "scroll", label: "Scroll depth", icon: MoveVertical, group: "Heatmaps", Component: ScrollDepthView },
  { key: "attention", label: "Attention", icon: Eye, group: "Heatmaps", Component: AttentionMapView },
  { key: "rage", label: "Rage clicks", icon: Zap, group: "Heatmaps", Component: RageClicksView },
  { key: "funnel", label: "Funnel", icon: Layers, group: "Conversion", Component: ConversionFunnelView },
  { key: "leaderboard", label: "View→Buy", icon: Trophy, group: "Conversion", Component: ViewToBuyView },
  { key: "dropoff", label: "Drop-off", icon: LogOut, group: "Conversion", Component: DropOffIndexView },
  { key: "search", label: "Search", icon: Search, group: "Acquisition", Component: SearchQueriesView },
  { key: "attribution", label: "Attribution", icon: Radio, group: "Acquisition", Component: AttributionView },
];

const GROUP_ORDER: Tab["group"][] = ["Live", "Heatmaps", "Conversion", "Acquisition"];

export function AnalyticsHub({ config, initialTab }: { config: AppConfig; initialTab?: string }) {
  const [active, setActive] = useState(initialTab ?? ANALYTICS_TABS[0].key);
  const current = ANALYTICS_TABS.find((t) => t.key === active) ?? ANALYTICS_TABS[0];
  const Active = current.Component;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="h-5 w-5 text-primary" /> Analytics &amp; Heatmaps
        </h1>
        <p className="text-xs text-muted-foreground">
          Behavioural analytics from the stable Telemetry &amp; Orders sheets — heatmaps, funnels,
          search demand, attribution and a live visitor feed. Falls back to seed data until the read
          endpoint is deployed.
        </p>
      </div>

      {/* Sub-nav grouped by theme */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3">
        {GROUP_ORDER.map((group) => (
          <div key={group} className="flex items-center gap-1.5">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              {group}
            </span>
            {ANALYTICS_TABS.filter((t) => t.group === group).map((t) => {
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
        ))}
      </div>

      {/* Remount on tab change so each view's data hook / clock resets cleanly. */}
      <Active key={current.key} config={config} />
    </div>
  );
}
