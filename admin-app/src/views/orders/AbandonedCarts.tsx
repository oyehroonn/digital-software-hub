/**
 * ABANDONED-CART list + one-click recovery email.
 *
 * Derives carts from telemetry: any session that fired an add-to-cart /
 * begin-checkout event but no purchase/order event. Value and product come from
 * the event metadata where present. Recovery email uses the Email API (copy
 * fallback in the browser).
 */
import { useMemo, useState } from "react";
import { RefreshCw, Mail, Copy, ShoppingCart } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { TelemetryEvent } from "@/lib/ecommerce";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { fmtMoney, timeAgo } from "@/lib/utils";
import { SectionHeader, SeedBadge, Stat, ToastHost, useToasts } from "./parts";
import { useTelemetryData } from "./ordersData";
import { recoveryTemplate, sendDraft, copyToClipboard } from "./orderEmail";

interface Cart {
  sessionId: string;
  email?: string;
  productId?: string;
  productName?: string;
  value?: number;
  currency?: string;
  lastAt?: string;
  steps: number;
  reachedCheckout: boolean;
}

const CART_RE = /add_to_cart|add-to-cart|begin_checkout|checkout_start|checkout/i;
const CHECKOUT_RE = /begin_checkout|checkout/i;
const PURCHASE_RE = /purchase|order|payment_success|thank_you|thankyou/i;

function metaVal(m: TelemetryEvent["metadata"], ...keys: string[]): unknown {
  if (!m || typeof m !== "object") return undefined;
  const bag = m as Record<string, unknown>;
  for (const k of keys) if (bag[k] != null && bag[k] !== "") return bag[k];
  return undefined;
}

function deriveCarts(events: TelemetryEvent[]): Cart[] {
  const bySession = new Map<string, TelemetryEvent[]>();
  for (const e of events) {
    const sid = e.sessionId || e.anonymousId;
    if (!sid) continue;
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid)!.push(e);
  }
  const carts: Cart[] = [];
  for (const [sid, evs] of bySession) {
    const hasCart = evs.some((e) => CART_RE.test(String(e.event)));
    const hasPurchase = evs.some((e) => PURCHASE_RE.test(String(e.event)));
    if (!hasCart || hasPurchase) continue;
    const cartEvs = evs.filter((e) => CART_RE.test(String(e.event)));
    let email: string | undefined;
    let productId: string | undefined;
    let productName: string | undefined;
    let value: number | undefined;
    let currency: string | undefined;
    let lastAt: string | undefined;
    for (const e of evs) {
      email = email || (metaVal(e.metadata, "email") as string) || undefined;
      productId = productId || e.productId || undefined;
      productName = productName || (metaVal(e.metadata, "productName", "product_name", "name") as string) || undefined;
      const v = metaVal(e.metadata, "value", "total", "price");
      if (v != null) value = parseFloat(String(v)) || value;
      currency = currency || (metaVal(e.metadata, "currency") as string) || undefined;
      if (e.timestamp && (!lastAt || Date.parse(e.timestamp) > Date.parse(lastAt))) lastAt = e.timestamp;
    }
    carts.push({
      sessionId: sid,
      email,
      productId,
      productName,
      value,
      currency,
      lastAt,
      steps: cartEvs.length,
      reachedCheckout: evs.some((e) => CHECKOUT_RE.test(String(e.event))),
    });
  }
  return carts.sort((a, b) => (Date.parse(b.lastAt || "") || 0) - (Date.parse(a.lastAt || "") || 0));
}

export function AbandonedCarts({ config }: { config: AppConfig }) {
  const { events, loading, seed, reload } = useTelemetryData(config);
  const { toasts, push } = useToasts();
  const [sending, setSending] = useState<string | null>(null);
  const carts = useMemo(() => deriveCarts(events), [events]);
  const recoverable = carts.filter((c) => c.email);
  const lostValue = carts.reduce((s, c) => s + (c.value ?? 0), 0);

  const recover = async (c: Cart) => {
    if (!c.email) return;
    setSending(c.sessionId);
    try {
      const draft = recoveryTemplate({
        email: c.email,
        productName: c.productName,
        value: c.value,
        currency: c.currency,
      });
      const res = await sendDraft(config, draft);
      push(res.detail, res.ok ? "ok" : "down");
    } finally {
      setSending(null);
    }
  };

  const copyList = async () => {
    const text = recoverable.map((c) => c.email).join(", ");
    const ok = await copyToClipboard(text);
    push(ok ? `Copied ${recoverable.length} emails.` : "Copy failed.", ok ? "ok" : "down");
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Abandoned carts"
        subtitle="Sessions that started a cart or checkout but never purchased. Win them back with a recovery email."
        right={
          <>
            <SeedBadge show={seed} />
            <Button variant="outline" size="sm" onClick={copyList} disabled={!recoverable.length}>
              <Copy /> Copy emails
            </Button>
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Stat label="Abandoned" value={String(carts.length)} />
        <Stat label="With email" value={String(recoverable.length)} sub="recoverable" />
        <Stat label="Reached checkout" value={String(carts.filter((c) => c.reachedCheckout).length)} />
        <Stat label="Value at risk" value={fmtMoney(lostValue, carts[0]?.currency || "AUD")} />
      </div>

      {carts.length === 0 && !loading ? (
        <Empty icon={<ShoppingCart className="h-8 w-8" />} title="No abandoned carts" hint="Nice — every started cart converted." />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Last activity</TH>
                <TH>Contact</TH>
                <TH>Product</TH>
                <TH className="text-right">Value</TH>
                <TH>Stage</TH>
                <TH className="text-right">Recover</TH>
              </TR>
            </THead>
            <TBody>
              {carts.map((c) => (
                <TR key={c.sessionId}>
                  <TD className="whitespace-nowrap text-muted-foreground" title={c.lastAt}>
                    {c.lastAt ? timeAgo(c.lastAt) : "—"}
                  </TD>
                  <TD>
                    {c.email ? (
                      <span className="font-medium">{c.email}</span>
                    ) : (
                      <span className="text-muted-foreground">anon · {c.sessionId.slice(0, 10)}</span>
                    )}
                  </TD>
                  <TD className="max-w-[220px] truncate">{c.productName ?? c.productId ?? "—"}</TD>
                  <TD className="text-right tabular-nums">
                    {c.value != null ? fmtMoney(c.value, c.currency || "AUD") : "—"}
                  </TD>
                  <TD>
                    <Badge variant={c.reachedCheckout ? "warn" : "muted"}>
                      {c.reachedCheckout ? "checkout" : "cart"}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!c.email || sending === c.sessionId}
                      onClick={() => recover(c)}
                    >
                      <Mail /> {sending === c.sessionId ? "Sending…" : "Recover"}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
      <ToastHost toasts={toasts} />
    </div>
  );
}
