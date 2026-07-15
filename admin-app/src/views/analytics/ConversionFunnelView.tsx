/**
 * Conversion-funnel tab — view → click → add-to-cart → checkout → order with
 * per-visitor drop-off, overall and per product. Wraps the existing <FunnelChart>
 * (which derives distinct-session counts per stage) with the shared seed-aware
 * data hook.
 */
import { Layers } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader } from "./shell";
import { FunnelChart } from "@/components/FunnelChart";

export function ConversionFunnelView({ config }: { config: AppConfig }) {
  const { events, seeded, loading, liveCount, refresh } = useAnalyticsData(config, { orders: false });
  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<Layers className="h-4 w-4 text-primary" />}
        title="Conversion funnel"
        subtitle="Distinct visitors reaching each stage, with the drop-off between steps. Scope the funnel to any single product to see where that product loses buyers."
        seeded={seeded}
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />
      <FunnelChart events={events} />
    </div>
  );
}
