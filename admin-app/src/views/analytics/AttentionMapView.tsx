/**
 * Look / attention tab — hover-dwell heatmap (where the eye & cursor linger).
 * Wraps the existing <LookMap> with the shared seed-aware data hook.
 */
import { Eye } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader, AnalyticsEmpty } from "./shell";
import { LookMap } from "./LookMap";

export function AttentionMapView({ config }: { config: AppConfig }) {
  const { events, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config, { orders: false });
  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<Eye className="h-4 w-4 text-primary" />}
        title="Look map · attention"
        subtitle="Where attention rests per page, weighted by dwell time — a spot stared at for seconds glows far hotter than one the cursor merely swept past."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />
      {isEmpty ? (
        <AnalyticsEmpty icon={<Eye className="h-7 w-7" />} />
      ) : (
        <LookMap events={events} />
      )}
    </div>
  );
}
