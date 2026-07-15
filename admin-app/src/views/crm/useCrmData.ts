/**
 * Single loader for the whole CRM area. Pulls telemetry (with seed fallback) and
 * orders once, then derives every downstream view's data (leads, scored leads,
 * behaviour index, customers, licences, renewal pipeline, win-back). CrmView
 * owns this and passes slices down so sub-views never refetch.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppConfig } from "@/lib/config";
import { fetchEvents, type TelemetryEvent } from "@/analytics/telemetryClient";
import { fetchOrders, type Order } from "@/lib/ecommerce";
import {
  deriveLeads,
  generateSeedLeads,
  buildBehaviorIndex,
  scoreLeads,
  buildCustomers,
  buildLicenses,
  renewalPipeline,
  buildWinBack,
  type ScoredLead,
  type Customer,
  type License,
  type WinBackEntry,
  type Behavior,
} from "@/lib/crm";

export interface CrmData {
  loading: boolean;
  error: string | null;
  /** True when leads came from the deterministic seed (read endpoint pending). */
  leadsSeeded: boolean;
  /** True when telemetry itself was seeded. */
  telemetrySeeded: boolean;
  events: TelemetryEvent[];
  orders: Order[];
  behaviorIndex: Map<string, Behavior>;
  leads: ScoredLead[];
  customers: Customer[];
  licenses: License[];
  renewals: License[];
  winBack: WinBackEntry[];
  refresh: () => void;
}

export function useCrmData(config: AppConfig): CrmData {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [telemetrySeeded, setTelemetrySeeded] = useState(false);
  const [leadsSeeded, setLeadsSeeded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ev, ords] = await Promise.all([
        fetchEvents(config, { seed: "auto" }),
        fetchOrders(config).catch(() => [] as Order[]),
      ]);
      setEvents(ev.events);
      setTelemetrySeeded(ev.seeded);
      setOrders(ords);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const behaviorIndex = useMemo(() => buildBehaviorIndex(events), [events]);

  const leads = useMemo(() => {
    let raw = deriveLeads(events);
    if (raw.length === 0) {
      raw = generateSeedLeads(events);
      setLeadsSeeded(true);
    } else {
      setLeadsSeeded(false);
    }
    return scoreLeads(raw, behaviorIndex);
  }, [events, behaviorIndex]);

  const customers = useMemo(() => buildCustomers(orders), [orders]);
  const licenses = useMemo(() => buildLicenses(orders), [orders]);
  const renewals = useMemo(() => renewalPipeline(customers), [customers]);
  const winBack = useMemo(() => buildWinBack(customers), [customers]);

  return {
    loading,
    error,
    leadsSeeded,
    telemetrySeeded,
    events,
    orders,
    behaviorIndex,
    leads,
    customers,
    licenses,
    renewals,
    winBack,
    refresh: load,
  };
}
