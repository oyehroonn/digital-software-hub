/**
 * useAnalyticsData — single source of truth for every Analytics & Heatmaps view.
 *
 * Fetches the STABLE Telemetry + Orders sheets (via the Apps Script GET read
 * action / read-proxy). Data is REAL-only: when the read endpoint returns
 * nothing (the sheet isn't shared yet) the hook returns empty arrays and sets
 * `isEmpty`, so views render a clean empty state instead of fabricated numbers.
 * The instant the sheet is readable, real rows render through the same path.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppConfig } from "@/lib/config";
import { fetchOrders, fetchTelemetry, type Order, type TelemetryEvent } from "@/lib/ecommerce";

export interface AnalyticsData {
  events: TelemetryEvent[];
  orders: Order[];
  loading: boolean;
  /** Soft error from the live fetch — shown as a notice. */
  error: string | null;
  /** True when there is no real telemetry AND no real orders → render empty state. */
  isEmpty: boolean;
  /** Live telemetry rows actually returned (0 when endpoint undeployed). */
  liveCount: number;
  refresh: () => void;
}

export function useAnalyticsData(config: AppConfig, opts: { orders?: boolean } = {}): AnalyticsData {
  const withOrders = opts.orders !== false;
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ev, ords] = await Promise.all([
        fetchTelemetry(config),
        withOrders ? fetchOrders(config).catch(() => [] as Order[]) : Promise.resolve([] as Order[]),
      ]);
      setLiveCount(ev.length);
      setEvents(ev);
      setOrders(ords);
    } catch (e) {
      // Never fabricate — a hard failure surfaces as an error + empty state.
      setError(e instanceof Error ? e.message : String(e));
      setEvents([]);
      setOrders([]);
      setLiveCount(0);
    } finally {
      setLoading(false);
    }
  }, [config, withOrders]);

  useEffect(() => {
    load();
  }, [load]);

  return useMemo(
    () => ({
      events,
      orders,
      loading,
      error,
      isEmpty: events.length === 0 && orders.length === 0,
      liveCount,
      refresh: load,
    }),
    [events, orders, loading, error, liveCount, load],
  );
}
