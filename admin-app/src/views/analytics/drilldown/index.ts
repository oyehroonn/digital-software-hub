/**
 * Click-to-drill-down system — public surface.
 *
 * The integration step wraps the analytics reports area in <DrillDownProvider>
 * (which fetches the shared dataset + hosts the slide-over) and uses <DrillLink>
 * / the typed link wrappers to make any product, page, customer or campaign in a
 * report table clickable. Each opens the matching detail lens, and every lens
 * respects the GLOBAL date-range + compare context.
 *
 *   <DrillDownProvider config={config}>
 *     …reports with <ProductLink id=… />, <PageLink url=… />, etc.…
 *   </DrillDownProvider>
 */

// Provider + navigation host.
export { DrillDownProvider } from "./DrillDownProvider";

// Public API hook + link primitives.
export { useDrillDown } from "./drillContext";
export {
  DrillLink,
  ProductLink,
  PageLink,
  CustomerLink,
  CampaignLink,
} from "./DrillLink";

// Target types.
export type {
  DrillTarget,
  ProductTarget,
  PageTarget,
  CustomerTarget,
  CampaignTarget,
  DrillDownApi,
} from "./drillContext";
export { targetKey, targetTitle } from "./drillContext";

// Detail lenses (also usable directly, e.g. embedded in a report).
export { ProductAnalytics, type ProductAnalyticsProps } from "./ProductDetail";
export { PageAnalytics, type PageAnalyticsProps } from "./PageDetail";
export { CustomerAnalytics, type CustomerAnalyticsProps } from "./CustomerDetail";
export { CampaignAnalytics, type CampaignAnalyticsProps } from "./CampaignDetail";
