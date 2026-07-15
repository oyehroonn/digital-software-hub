/**
 * Click-heatmap tab — per-page click density over a page wireframe.
 * Wraps the existing <ClickHeatmap> canvas with the shared seed-aware data hook
 * so it renders live telemetry, or the deterministic seed when the read endpoint
 * isn't deployed yet.
 */
import { Flame } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader } from "./shell";
import { ClickHeatmap } from "./ClickHeatmap";

export function ClickHeatmapView({ config }: { config: AppConfig }) {
  const { events, seeded, loading, liveCount, refresh } = useAnalyticsData(config, { orders: false });
  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<Flame className="h-4 w-4 text-warn" />}
        title="Click heatmap"
        subtitle="Where visitors click on each page — a density field over a page wireframe. Pick a page, hover a hotspot for click counts and the dominant element."
        seeded={seeded}
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />
      <ClickHeatmap events={events} />
    </div>
  );
}
