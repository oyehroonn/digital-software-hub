/**
 * Analytics REPORTS — public surface.
 *
 * The integration mounts <DateRangeProvider> once around the analytics area and
 * renders <DateRangeControls/> in the toolbar; every report below reads that
 * global range via `useDateRange()` and shows vs-previous-period deltas. Each
 * report is a self-contained `{ config }` view with the deterministic-seed
 * fallback, so it renders before the read endpoint is deployed.
 */

// Global date-range + compare context (the toolbar the integration wires in).
export {
  DateRangeProvider,
  DateRangeControls,
  useDateRange,
  resolveRange,
  RANGE_PRESETS,
  type RangePreset,
  type ResolvedRange,
  type DateRangeState,
} from "./dateRange";

// Shared report kit (chart theme, KPI cards, deltas, bucketing) for new reports.
export * from "./reportKit";

// Pure customer aggregation (overview, cohorts, RFM, predicted LTV).
export * from "./customerMetrics";

// Report pages.
export { SalesReport } from "./SalesReport";
export { TrafficReport } from "./TrafficReport";
export { SessionsBehaviorReport } from "./SessionsBehaviorReport";
export { ConversionReport } from "./ConversionReport";
export { CustomersOverview } from "./CustomersOverview";
export { CustomersCohorts } from "./CustomersCohorts";
export { CustomersRFM } from "./CustomersRFM";
export { MarketingReport } from "./MarketingReport";
export { ProductsReport } from "./ProductsReport";
export { FinancesReport } from "./FinancesReport";

// Sales reports suite — Shopify-parity, each a graph+table report that reads the
// global date-range/compare context and shows vs-previous deltas.
export { SalesReports, SALES_REPORTS } from "./SalesReports";
export { SalesOverTime } from "./SalesOverTime";
export { SalesByProduct } from "./SalesByProduct";
export { SalesBySku } from "./SalesBySku";
export { SalesByChannel } from "./SalesByChannel";
export { SalesByLocation, SalesByCity } from "./SalesByLocation";
export { SalesByReferrer } from "./SalesByReferrer";
export { SalesByDiscount } from "./SalesByDiscount";
export { SalesAov } from "./SalesAov";
export { SalesTaxes } from "./SalesTaxes";
export { SalesReturns } from "./SalesReturns";
export { SalesGrossNet } from "./SalesGrossNet";
