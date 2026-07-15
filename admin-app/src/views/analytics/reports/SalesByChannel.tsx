/**
 * Sales by channel — net sales split across sales channels (online store, POS,
 * marketplace, wholesale…) for the selected range, with vs-previous deltas.
 * Reads the channel / store column on the order, defaulting to "Online Store".
 */
import { Store } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { DimensionReport } from "./DimensionReport";
import { channelOf } from "./salesData";

export function SalesByChannel({ config }: { config: AppConfig }) {
  return (
    <DimensionReport
      config={config}
      icon={<Store className="h-5 w-5 text-primary" />}
      title="Sales by channel"
      subtitle="Where sales happen — net sales share per channel/store in the selected range, each with its change vs the previous period. Lights up per-channel automatically when the Orders sheet carries a channel column."
      labelHeader="Channel"
      noun="channels"
      keyFn={channelOf}
      chart="donut"
      topN={8}
    />
  );
}
