/**
 * Sales by traffic referrer — net sales grouped by the traffic source the
 * storefront stamps on each order (direct, organic search, social, email, paid,
 * or a referring host), with vs-previous deltas. Graph (share) + table.
 */
import { Share2 } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { DimensionReport } from "./DimensionReport";
import { referrerOf } from "./salesData";

export function SalesByReferrer({ config }: { config: AppConfig }) {
  return (
    <DimensionReport
      config={config}
      icon={<Share2 className="h-5 w-5 text-primary" />}
      title="Sales by traffic referrer"
      subtitle="Which traffic sources convert to revenue — net sales per referrer channel in the selected range, each with its change vs the previous period. Source is read from the order's referrer/UTM (or the checkout's 'via …' stamp)."
      labelHeader="Referrer"
      noun="referrers"
      keyFn={referrerOf}
      chart="donut"
      topN={8}
      emptyHint="Orders in this range don't carry a referrer/source yet."
    />
  );
}
