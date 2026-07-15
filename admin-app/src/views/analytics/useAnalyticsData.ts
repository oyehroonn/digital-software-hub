/**
 * useAnalyticsData — single source of truth for every Analytics & Heatmaps view.
 *
 * Fetches the STABLE Telemetry + Orders sheets (via the Apps Script GET read
 * action / read-proxy) and, when the read endpoint returns nothing or is not
 * deployed yet, transparently falls back to the DETERMINISTIC seed so the view
 * renders immediately. `seeded` is true whenever the data is synthetic — views
 * surface a "seed" badge from it. The seed dataset is memoized per hook instance
 * so hover counts / rankings stay stable between refreshes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppConfig } from "@/lib/config";
import { fetchOrders, fetchTelemetry, type Order, type TelemetryEvent } from "@/lib/ecommerce";
import { generateSeed } from "./seed";

export interface AnalyticsData {
  events: TelemetryEvent[];
  orders: Order[];
  loading: boolean;
  /** Soft error from the live fetch — shown as a notice; seed still renders. */
  error: string | null;
  /** True when the rendered data is the deterministic seed, not live telemetry. */
  seeded: boolean;
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
  const [seeded, setSeeded] = useState(false);
  const [liveCount, setLiveCount] = useState(0);

  // One deterministic seed dataset per mount (now-relative but stable after).
  const seed = useRef(generateSeed()).current;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ev, ords] = await Promise.all([
        fetchTelemetry(config),
        withOrders ? fetchOrders(config).catch(() => [] as Order[]) : Promise.resolve([] as Order[]),
      ]);
      setLiveCount(ev.length);
      if (ev.length === 0) {
        // Endpoint not deployed / empty sheet → seed fallback.
        setEvents(seed.events);
        setOrders(ords.length ? ords : seed.orders);
        setSeeded(true);
      } else {
        setEvents(ev);
        setOrders(ords);
        setSeeded(false);
      }
    } catch (e) {
      // Hard failure → still render the seed so the area is usable offline.
      setError(e instanceof Error ? e.message : String(e));
      setEvents(seed.events);
      setOrders(seed.orders);
      setSeeded(true);
      setLiveCount(0);
    } finally {
      setLoading(false);
    }
  }, [config, withOrders, seed]);

  useEffect(() => {
    load();
  }, [load]);

  return useMemo(
    () => ({ events, orders, loading, error, seeded, liveCount, refresh: load }),
    [events, orders, loading, error, seeded, liveCount, load],
  );
}
