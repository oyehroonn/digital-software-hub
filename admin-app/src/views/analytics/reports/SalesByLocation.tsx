/**
 * Sales by location — net sales by destination country (and city) for the
 * selected range, ranked with vs-previous deltas. Graph (top countries) + a
 * country table and a compact top-cities list.
 */
import { useMemo } from "react";
import { Globe2 } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { flagEmoji } from "@/lib/geo";
import { DimensionReport } from "./DimensionReport";
import { cityLabelOf, countryOf } from "./salesData";

export function SalesByLocation({ config }: { config: AppConfig }) {
  // Stable identity so DimensionReport's memoised deriv doesn't re-run each render.
  const keyFn = useMemo(() => (o: Parameters<typeof countryOf>[0]) => countryOf(o) || "??", []);
  const labelFn = useMemo(
    () => (o: Parameters<typeof countryOf>[0]) => {
      const cc = countryOf(o) || "??";
      return `${flagEmoji(cc)} ${cc}`;
    },
    [],
  );

  return (
    <DimensionReport
      config={config}
      icon={<Globe2 className="h-5 w-5 text-primary" />}
      title="Sales by location"
      subtitle="Where your customers are — net sales, orders and units by destination country in the selected range, each with its change vs the previous period."
      labelHeader="Country"
      noun="countries"
      keyFn={keyFn}
      labelFn={labelFn}
      chart="bar"
      topN={12}
      emptyHint="Orders in this range don't carry a country yet."
    />
  );
}

/**
 * A second, city-grained cut is available by swapping the key/label functions;
 * exported so an integration can mount a "by city" variant if desired.
 */
export function SalesByCity({ config }: { config: AppConfig }) {
  const keyFn = useMemo(() => (o: Parameters<typeof cityLabelOf>[0]) => cityLabelOf(o), []);
  return (
    <DimensionReport
      config={config}
      icon={<Globe2 className="h-5 w-5 text-primary" />}
      title="Sales by city"
      subtitle="Net sales by city in the selected range, each with its change vs the previous period."
      labelHeader="City"
      noun="cities"
      keyFn={keyFn}
      chart="bar"
      topN={15}
      emptyHint="Orders in this range don't carry a city yet."
    />
  );
}
