/**
 * useSalesScope — one hook every Sales report shares.
 *
 * Fetches the stable Orders + Telemetry sheets (seed fallback) and slices the
 * orders into the GLOBAL current window (`cur`) and, when compare is on, the
 * previous window (`prev`) — so a report only has to describe how to reduce
 * them. Re-scopes automatically whenever the shared date-range/compare context
 * changes.
 */
import { useMemo } from "react";
import type { AppConfig } from "@/lib/config";
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import { useAnalyticsData } from "../useAnalyticsData";
import { useDateRange, type DateRangeState } from "./dateRange";
import { currencyOf, tsOf } from "./salesData";

export interface SalesScope {
  events: TelemetryEvent[];
  orders: Order[];
  cur: Order[];
  prev: Order[];
  range: DateRangeState;
  currency: string;
  seeded: boolean;
  loading: boolean;
  liveCount: number;
  refresh: () => void;
}

export function useSalesScope(config: AppConfig): SalesScope {
  const { events, orders, seeded, loading, liveCount, refresh } = useAnalyticsData(config);
  const range = useDateRange();

  const cur = useMemo(() => orders.filter((o) => range.inRange(tsOf(o))), [orders, range]);
  const prev = useMemo(
    () => (range.compareEnabled ? orders.filter((o) => range.inPrev(tsOf(o))) : []),
    [orders, range],
  );
  const currency = useMemo(() => currencyOf(orders), [orders]);

  return { events, orders, cur, prev, range, currency, seeded, loading, liveCount, refresh };
}
