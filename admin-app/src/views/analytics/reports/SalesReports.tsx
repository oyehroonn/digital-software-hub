/**
 * SalesReports — the Sales analytics area as one screen.
 *
 * Lists the whole Shopify-parity sales suite and hosts each report behind a pill
 * sub-nav, with ONE global date-range + compare toolbar (DateRangeControls)
 * driving every report at once. Mounts its own <DateRangeProvider> so the area
 * is self-contained; the integration can instead mount the individual reports
 * under a higher-level provider if it wants the range shared across areas.
 */
import { useMemo, useState, type ComponentType } from "react";
import {
  BadgePercent,
  Barcode,
  CalendarClock,
  Globe2,
  Landmark,
  LayoutGrid,
  Package,
  Scale,
  Share2,
  ShoppingCart,
  Store,
  TrendingUp,
  Undo2,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { DateRangeControls, DateRangeProvider } from "./dateRange";
import { SalesOverTime } from "./SalesOverTime";
import { SalesByProduct } from "./SalesByProduct";
import { SalesBySku } from "./SalesBySku";
import { SalesByChannel } from "./SalesByChannel";
import { SalesByLocation } from "./SalesByLocation";
import { SalesByDiscount } from "./SalesByDiscount";
import { SalesByReferrer } from "./SalesByReferrer";
import { SalesAov } from "./SalesAov";
import { SalesTaxes } from "./SalesTaxes";
import { SalesReturns } from "./SalesReturns";
import { SalesGrossNet } from "./SalesGrossNet";

interface ReportDef {
  key: string;
  label: string;
  blurb: string;
  icon: typeof Package;
  Component: ComponentType<{ config: AppConfig }>;
}

export const SALES_REPORTS: ReportDef[] = [
  { key: "over-time", label: "Sales over time", blurb: "Net sales, orders, units & AOV trended over the range.", icon: CalendarClock, Component: SalesOverTime },
  { key: "by-product", label: "By product", blurb: "Revenue, orders & units ranked per product.", icon: Package, Component: SalesByProduct },
  { key: "by-sku", label: "By SKU / variant", blurb: "The variant-level cut of every sale.", icon: Barcode, Component: SalesBySku },
  { key: "by-channel", label: "By channel", blurb: "Net sales split across sales channels.", icon: Store, Component: SalesByChannel },
  { key: "by-location", label: "By location", blurb: "Where your customers are, by country.", icon: Globe2, Component: SalesByLocation },
  { key: "by-referrer", label: "By traffic referrer", blurb: "Which sources convert to revenue.", icon: Share2, Component: SalesByReferrer },
  { key: "by-discount", label: "By discount", blurb: "Discount spend, codes & discount rate.", icon: BadgePercent, Component: SalesByDiscount },
  { key: "aov", label: "AOV over time", blurb: "Average order value & basket size trended.", icon: TrendingUp, Component: SalesAov },
  { key: "taxes", label: "Taxes", blurb: "Tax collected over time and by destination.", icon: Landmark, Component: SalesTaxes },
  { key: "returns", label: "Returns & refunds", blurb: "Refunded value, refund rate & top returns.", icon: Undo2, Component: SalesReturns },
  { key: "gross-net", label: "Gross → net", blurb: "Gross minus discounts & refunds = net.", icon: Scale, Component: SalesGrossNet },
];

export function SalesReports({ config, initialReport }: { config: AppConfig; initialReport?: string }) {
  const [active, setActive] = useState<string | null>(initialReport ?? null);
  const current = useMemo(() => SALES_REPORTS.find((r) => r.key === active) ?? null, [active]);

  return (
    <DateRangeProvider defaultPreset="30d" defaultCompare>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <ShoppingCart className="h-5 w-5 text-primary" /> Sales reports
            </h1>
            <p className="max-w-3xl text-xs text-muted-foreground">
              A Shopify-parity sales suite over the stable Orders sheet — sales over time, by product, SKU,
              channel, location, referrer and discount, plus AOV, taxes, returns and the gross-to-net bridge.
              One date range &amp; compare toggle drives every report.
            </p>
          </div>
          <DateRangeControls />
        </div>

        {/* Pill sub-nav */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
          <button
            onClick={() => setActive(null)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              active === null
                ? "border-primary/40 bg-primary/15 text-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> All reports
          </button>
          {SALES_REPORTS.map((r) => {
            const Icon = r.icon;
            const on = r.key === active;
            return (
              <button
                key={r.key}
                onClick={() => setActive(r.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  on
                    ? "border-primary/40 bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {r.label}
              </button>
            );
          })}
        </div>

        {current ? (
          <current.Component key={current.key} config={config} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SALES_REPORTS.map((r) => {
              const Icon = r.icon;
              return (
                <Card
                  key={r.key}
                  onClick={() => setActive(r.key)}
                  className="group cursor-pointer p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground group-hover:text-primary">{r.label}</div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{r.blurb}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DateRangeProvider>
  );
}
