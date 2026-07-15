/**
 * Analytics & Heatmaps area — public surface.
 *
 * The integration step wires `AnalyticsHub` (the whole area behind one nav
 * entry) or any individual view into src/App.tsx and the nav. Every view takes
 * `{ config }`, self-fetches live telemetry, and falls back to the deterministic
 * seed so it renders before the read endpoint is deployed.
 */

// Composed area (recommended single entry point).
export { AnalyticsHub, ANALYTICS_TABS } from "./AnalyticsHub";

// Individual tab views (each mountable on its own nav entry).
export { RealtimeFeedView } from "./RealtimeFeedView";
export { ClickHeatmapView } from "./ClickHeatmapView";
export { ScrollDepthView } from "./ScrollDepthView";
export { AttentionMapView } from "./AttentionMapView";
export { RageClicksView } from "./RageClicksView";
export { ConversionFunnelView } from "./ConversionFunnelView";
export { ViewToBuyView } from "./ViewToBuyView";
export { DropOffIndexView } from "./DropOffIndexView";
export { SearchQueriesView } from "./SearchQueriesView";
export { AttributionView } from "./AttributionView";
export { BehaviorFlow } from "./BehaviorFlow";
export { Acquisition } from "./Acquisition";
export { UtmCampaigns } from "./UtmCampaigns";

// Visual heatmap overlay — full-page screenshot with click/move/scroll painted on top.
export { HeatmapOverlay } from "./HeatmapOverlay";

// Low-level heatmap components (reused by the views above).
export { ClickHeatmap } from "./ClickHeatmap";
export { LookMap } from "./LookMap";

// Shared data hook + deterministic seed (for tests / new views).
export { useAnalyticsData, type AnalyticsData } from "./useAnalyticsData";
export { generateSeed, isSeed, SEED_FLAG } from "./seed";
