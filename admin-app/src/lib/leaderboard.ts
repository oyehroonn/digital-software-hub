/**
 * Product VIEW→BUY leaderboard.
 *
 * Builds on `buildProductAnalytics` (views / clicks / conversions / revenue per
 * product, joining Telemetry with the Orders sheet) and adds the headline sales
 * metric — view→buy rate (orders / views) — plus click→buy and a rank. Products
 * with real demand but poor conversion float up as opportunities; strong
 * converters as what to double down on.
 */
import type { Order, TelemetryEvent } from "./ecommerce";
import { buildProductAnalytics, type ProductStat } from "./analytics";

export interface LeaderRow extends ProductStat {
  rank: number;
  viewToBuy: number; // conversions / views
  clickToBuy: number; // conversions / clicks
  aov: number; // revenue / conversions
}

export interface Leaderboard {
  rows: LeaderRow[];
  totals: {
    views: number;
    clicks: number;
    conversions: number;
    revenue: number;
    currency: string;
    viewToBuy: number;
  };
  bestConverter?: LeaderRow;
  biggestOpportunity?: LeaderRow; // high views, low conversion
}

export type LeaderSort = "revenue" | "viewToBuy" | "views" | "conversions";

export function buildLeaderboard(
  events: TelemetryEvent[],
  orders: Order[] = [],
  sort: LeaderSort = "revenue",
): Leaderboard {
  const stats = buildProductAnalytics(events, orders);

  let views = 0;
  let clicks = 0;
  let conversions = 0;
  let revenue = 0;
  let currency = "USD";

  const enriched: LeaderRow[] = stats.map((s) => {
    views += s.views;
    clicks += s.clicks;
    conversions += s.conversions;
    revenue += s.revenue;
    if (s.revenue > 0) currency = s.currency;
    return {
      ...s,
      rank: 0,
      viewToBuy: s.views ? s.conversions / s.views : 0,
      clickToBuy: s.clicks ? s.conversions / s.clicks : 0,
      aov: s.conversions ? s.revenue / s.conversions : 0,
    };
  });

  const cmp: Record<LeaderSort, (a: LeaderRow, b: LeaderRow) => number> = {
    revenue: (a, b) => b.revenue - a.revenue || b.viewToBuy - a.viewToBuy,
    viewToBuy: (a, b) => b.viewToBuy - a.viewToBuy || b.conversions - a.conversions,
    views: (a, b) => b.views - a.views,
    conversions: (a, b) => b.conversions - a.conversions || b.revenue - a.revenue,
  };
  enriched.sort(cmp[sort]);
  enriched.forEach((r, i) => (r.rank = i + 1));

  // Best converter among products with meaningful traffic.
  const meaningful = enriched.filter((r) => r.views >= 5);
  const bestConverter = [...meaningful].sort((a, b) => b.viewToBuy - a.viewToBuy)[0];
  // Opportunity: lots of eyeballs, weak conversion.
  const biggestOpportunity = [...meaningful]
    .filter((r) => r.viewToBuy < 0.05)
    .sort((a, b) => b.views - a.views)[0];

  return {
    rows: enriched,
    totals: {
      views,
      clicks,
      conversions,
      revenue,
      currency,
      viewToBuy: views ? conversions / views : 0,
    },
    bestConverter,
    biggestOpportunity,
  };
}
