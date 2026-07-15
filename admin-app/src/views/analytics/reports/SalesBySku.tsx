/**
 * Sales by SKU / variant — the variant-level cut of sales: net sales, orders and
 * units per SKU in the selected range, ranked with vs-previous deltas.
 */
import { Barcode } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { DimensionReport } from "./DimensionReport";
import { productOf, skuOf } from "./salesData";

export function SalesBySku({ config }: { config: AppConfig }) {
  return (
    <DimensionReport
      config={config}
      icon={<Barcode className="h-5 w-5 text-primary" />}
      title="Sales by SKU / variant"
      subtitle="Variant-level performance — net sales, orders and units per SKU in the selected range, each with its change vs the previous period."
      labelHeader="SKU"
      noun="SKUs"
      keyFn={skuOf}
      labelFn={(o) => {
        const sku = skuOf(o);
        const name = productOf(o);
        return name && name !== "(unknown)" ? `${sku} · ${name}` : sku;
      }}
      chart="bar"
      topN={12}
      emptyHint="Orders in this range don't carry a SKU yet."
    />
  );
}
