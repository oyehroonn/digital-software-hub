/**
 * Customer / lead aggregation derived from the STABLE Orders sheet.
 *
 * The Orders sheet IS the purchase & licence history — one row per line item.
 * Grouping by email (falling back to name+phone) reconstructs a customer/lead
 * record: their orders, lifetime spend, cadence, products owned, and first/last
 * seen. From those records we score renewal / churn risk deterministically so
 * the AI features have real numbers to reason about even when the LLM is down.
 */
import type { Order } from "./ecommerce";

export interface CustomerProduct {
  productId: string;
  name: string;
  qty: number;
  lastPurchased: number; // epoch ms
}

export interface CustomerRecord {
  key: string; // stable id (email or name|phone)
  email: string;
  name: string;
  phone: string;
  location: string;
  currency: string;
  orders: Order[];
  orderCount: number; // distinct order line items
  totalSpend: number;
  avgOrderValue: number;
  firstOrder: number; // epoch ms (0 if unknown)
  lastOrder: number; // epoch ms (0 if unknown)
  products: CustomerProduct[];
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function ts(v: unknown): number {
  const t = Date.parse(String(v ?? ""));
  return Number.isNaN(t) ? 0 : t;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Group order rows into per-customer records, richest signal first. */
export function buildCustomers(orders: Order[]): CustomerRecord[] {
  const byKey = new Map<string, CustomerRecord>();

  for (const o of orders) {
    const email = str(o.email).toLowerCase();
    const name = str(o.customerName);
    const phone = str(o.phone);
    const key = email || `${name.toLowerCase()}|${phone}` || "unknown";
    if (key === "unknown") continue;

    let rec = byKey.get(key);
    if (!rec) {
      rec = {
        key,
        email,
        name,
        phone,
        location: [str(o.city), str(o.country)].filter(Boolean).join(", "),
        currency: str(o.currency) || "USD",
        orders: [],
        orderCount: 0,
        totalSpend: 0,
        avgOrderValue: 0,
        firstOrder: 0,
        lastOrder: 0,
        products: [],
      };
      byKey.set(key, rec);
    }

    const when = ts(o.timestamp);
    const qty = num(o.quantity) || 1;
    const line = num(o.price) * qty;

    rec.orders.push(o);
    rec.orderCount += 1;
    rec.totalSpend += line;
    if (!rec.name && name) rec.name = name;
    if (!rec.phone && phone) rec.phone = phone;
    if (!rec.location) rec.location = [str(o.city), str(o.country)].filter(Boolean).join(", ");
    if (o.currency) rec.currency = str(o.currency);
    if (when) {
      rec.firstOrder = rec.firstOrder ? Math.min(rec.firstOrder, when) : when;
      rec.lastOrder = Math.max(rec.lastOrder, when);
    }

    const pid = str(o.productId) || str(o.sku) || str(o.productName);
    if (pid) {
      let p = rec.products.find((x) => x.productId === pid);
      if (!p) {
        p = { productId: pid, name: str(o.productName) || pid, qty: 0, lastPurchased: 0 };
        rec.products.push(p);
      }
      p.qty += qty;
      if (when) p.lastPurchased = Math.max(p.lastPurchased, when);
      if (!p.name && o.productName) p.name = str(o.productName);
    }
  }

  const out = [...byKey.values()];
  for (const r of out) {
    r.avgOrderValue = r.orderCount ? r.totalSpend / r.orderCount : 0;
    r.products.sort((a, b) => b.lastPurchased - a.lastPurchased);
  }
  return out.sort((a, b) => b.lastOrder - a.lastOrder || b.totalSpend - a.totalSpend);
}

/* ------------------------------------------------------------------ *
 * Churn / renewal-risk scoring (deterministic RFM + renewal window)
 * ------------------------------------------------------------------ */

export type RiskLevel = "low" | "medium" | "high";

export interface ChurnRow extends CustomerRecord {
  recencyDays: number; // days since last order
  daysToRenewal: number; // 365-day cycle from last order; negative = overdue
  riskScore: number; // 0..100
  riskLevel: RiskLevel;
  reasons: string[]; // plain-English drivers (deterministic)
}

const DAY = 86_400_000;
const RENEWAL_CYCLE_DAYS = 365;

/**
 * Score each customer's renewal/churn risk. Higher = more likely to lapse.
 * Purely deterministic (no LLM): recency dominates, the annual renewal window
 * adds urgency, and one-and-done buyers carry extra risk. Value doesn't lower
 * risk — it flags who's worth saving (surfaced separately in the UI).
 */
export function scoreChurn(customers: CustomerRecord[], now: number = Date.now()): ChurnRow[] {
  const rows: ChurnRow[] = customers.map((c) => {
    const recencyDays = c.lastOrder ? Math.max(0, Math.floor((now - c.lastOrder) / DAY)) : 999;
    const daysToRenewal = RENEWAL_CYCLE_DAYS - recencyDays;
    const reasons: string[] = [];

    // Recency: 0 pts fresh → ~60 pts at a year+ silent.
    let score = Math.min(60, (recencyDays / RENEWAL_CYCLE_DAYS) * 60);
    if (recencyDays >= 180) reasons.push(`No purchase in ${recencyDays} days`);

    // Renewal window urgency.
    if (daysToRenewal < 0) {
      score += 35;
      reasons.push(`Licence renewal ${Math.abs(daysToRenewal)} days overdue`);
    } else if (daysToRenewal <= 60) {
      score += 25;
      reasons.push(`Renewal due in ${daysToRenewal} days`);
    }

    // One-and-done buyers churn harder.
    if (c.orderCount <= 1) {
      score += 10;
      reasons.push("Single purchase — no repeat yet");
    } else {
      reasons.push(`${c.orderCount} orders on record`);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const riskLevel: RiskLevel = score >= 66 ? "high" : score >= 40 ? "medium" : "low";

    return { ...c, recencyDays, daysToRenewal, riskScore: score, riskLevel, reasons };
  });

  // Highest risk first; break ties by lifetime value (save the valuable ones).
  return rows.sort((a, b) => b.riskScore - a.riskScore || b.totalSpend - a.totalSpend);
}
