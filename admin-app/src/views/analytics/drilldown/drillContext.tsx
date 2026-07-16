/**
 * drillContext — the navigation core of the click-to-drill-down system.
 *
 * Holds a STACK of drill targets (so a product → its buyer → that customer's
 * campaign can be explored without losing your place) plus the shared analytics
 * dataset the detail views render from. `useDrillDown()` is the public API any
 * report/table row uses via <DrillLink>. It is split from the provider so
 * <DrillLink> and the detail views can import the hook without a cycle
 * (context imports nothing from those files).
 *
 * Read outside a provider it returns a safe no-op API (`enabled: false`), so a
 * report still renders and its links simply do nothing rather than throwing.
 */
import { createContext, useContext } from "react";
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import type { AppConfig } from "@/lib/config";

/* ------------------------------------------------------------------ *
 * Drill targets — the four detail lenses
 * ------------------------------------------------------------------ */
export interface ProductTarget {
  kind: "product";
  id: string;
  name?: string;
}
export interface PageTarget {
  kind: "page";
  /** page path or full url; normalised inside PageAnalytics */
  url: string;
  title?: string;
}
export interface CustomerTarget {
  kind: "customer";
  email: string;
  name?: string;
}
export interface CampaignTarget {
  kind: "campaign";
  source?: string;
  medium?: string;
  campaign?: string;
  /** optional display label (e.g. "google / cpc · brand_search") */
  label?: string;
}

export type DrillTarget = ProductTarget | PageTarget | CustomerTarget | CampaignTarget;

/** A stable identity string for a target (used as the panel/history key). */
export function targetKey(t: DrillTarget): string {
  switch (t.kind) {
    case "product":
      return `product:${t.id}`;
    case "page":
      return `page:${t.url}`;
    case "customer":
      return `customer:${t.email.toLowerCase()}`;
    case "campaign":
      return `campaign:${t.source ?? ""}|${t.medium ?? ""}|${t.campaign ?? ""}`;
  }
}

export function targetTitle(t: DrillTarget): string {
  switch (t.kind) {
    case "product":
      return t.name || t.id;
    case "page":
      return t.title || t.url;
    case "customer":
      return t.name || t.email;
    case "campaign":
      return t.label || [t.source, t.medium].filter(Boolean).join(" / ") || t.campaign || "(direct)";
  }
}

/* ------------------------------------------------------------------ *
 * Context value
 * ------------------------------------------------------------------ */
export interface DrillDownApi {
  /** True when a real provider is mounted (links are interactive). */
  enabled: boolean;
  /** Open a new detail view, pushing onto the history stack. */
  open: (t: DrillTarget) => void;
  /** Replace the current top of the stack (no history entry). */
  replace: (t: DrillTarget) => void;
  /** Pop one level; closes the panel when the stack empties. */
  back: () => void;
  /** Close the panel and clear the stack. */
  close: () => void;
  /** Current navigation stack (bottom → top). */
  stack: DrillTarget[];
  /** Whether the slide-over is open. */
  isOpen: boolean;

  /* Shared dataset the detail views derive from. */
  events: TelemetryEvent[];
  orders: Order[];
  config: AppConfig | null;
  loading: boolean;
  refresh: () => void;
}

const NOOP: DrillDownApi = {
  enabled: false,
  open: () => {},
  replace: () => {},
  back: () => {},
  close: () => {},
  stack: [],
  isOpen: false,
  events: [],
  orders: [],
  config: null,
  loading: false,
  refresh: () => {},
};

export const DrillDownContext = createContext<DrillDownApi>(NOOP);

/** Public hook — any table row / product name uses this via <DrillLink>. */
export function useDrillDown(): DrillDownApi {
  return useContext(DrillDownContext);
}
