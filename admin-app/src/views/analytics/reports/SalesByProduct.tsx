/**
 * Sales by product — net sales, orders and units for every product in the
 * selected range, ranked with vs-previous deltas. Graph (top products) + table.
 */
import { Package } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { DimensionReport } from "./DimensionReport";
import { productOf } from "./salesData";

export function SalesByProduct({ config }: { config: AppConfig }) {
  return (
    <DimensionReport
      config={config}
      icon={<Package className="h-5 w-5 text-primary" />}
      title="Sales by product"
      subtitle="Which products drive revenue in the selected range — net sales, orders and units per product, each with its change vs the previous period."
      labelHeader="Product"
      noun="products"
      keyFn={productOf}
      chart="bar"
      topN={12}
      emptyHint="Orders in this range don't carry a product name yet."
    />
  );
}
