/**
 * REPEAT-BUYER detector. Groups the Orders sheet by customer (email/phone) to
 * surface who has bought more than once — your warmest upsell/renewal targets —
 * with lifetime value, cadence and a one-click "thank-you / upsell" email.
 */
import { useMemo, useState } from "react";
import { RefreshCw, Repeat, Send, Crown, ChevronDown, ChevronRight } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { fmtMoney } from "@/lib/utils";
import { SectionHeader, Stat, ToastHost, useToasts, fmtDate } from "./parts";
import { useOrdersData, groupByCustomer, orderValue, orderCurrency, type CustomerGroup } from "./ordersData";
import { sendDraft } from "./orderEmail";

function daysBetween(a?: number, b?: number): number | null {
  if (a == null || b == null) return null;
  return Math.round(Math.abs(b - a) / 86400000);
}

export function RepeatBuyers({ config }: { config: AppConfig }) {
  const { orders, loading, reload } = useOrdersData(config);
  const { toasts, push } = useToasts();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const groups = useMemo(() => groupByCustomer(orders), [orders]);
  const repeat = groups.filter((g) => g.count > 1);
  const repeatRevenue = repeat.reduce((s, g) => s + g.total, 0);
  const totalRevenue = groups.reduce((s, g) => s + g.total, 0);
  const repeatRate = groups.length ? repeat.length / groups.length : 0;

  const upsell = async (g: CustomerGroup) => {
    if (!g.email) {
      push("No email for this customer.", "down");
      return;
    }
    setSending(g.key);
    try {
      const first = g.name.split(" ")[0];
      const owned = g.products.slice(0, 4).join(", ");
      const body = [
        `Hi ${first},`,
        "",
        `Thank you for being one of our most valued customers — ${g.count} orders with DSM and counting.`,
        owned ? `You're currently running: ${owned}.` : "",
        "",
        "Because you're a returning customer, you qualify for priority upgrade pricing on your next license or add-on module. Reply and I'll put together a tailored offer — or book a 15-minute review and we'll map the best next step for your team.",
        "",
        "Warm regards,\nThe DSM Solutions Team",
      ]
        .filter(Boolean)
        .join("\n");
      const res = await sendDraft(config, {
        to: g.email,
        subject: `A thank-you (and priority pricing) for a valued DSM customer`,
        body,
      });
      push(res.detail, res.ok ? "ok" : "down");
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Repeat buyers"
        subtitle="Customers who bought more than once — your warmest renewal and upsell targets."
        right={
          <>
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Stat label="Repeat buyers" value={String(repeat.length)} sub={`of ${groups.length} customers`} />
        <Stat label="Repeat rate" value={`${(repeatRate * 100).toFixed(0)}%`} />
        <Stat
          label="Repeat revenue"
          value={fmtMoney(repeatRevenue, repeat[0]?.currency || "AUD")}
          sub={totalRevenue ? `${((repeatRevenue / totalRevenue) * 100).toFixed(0)}% of total` : undefined}
        />
      </div>

      {repeat.length === 0 ? (
        <Empty icon={<Repeat className="h-8 w-8" />} title="No repeat buyers yet" hint="Once a customer places a second order they'll show up here." />
      ) : (
        <div className="flex flex-col gap-2">
          {repeat.map((g, i) => {
            const isOpen = expanded === g.key;
            const cadence = daysBetween(g.firstAt, g.lastAt);
            const avgGap = cadence != null && g.count > 1 ? Math.round(cadence / (g.count - 1)) : null;
            return (
              <div key={g.key} className="rounded-lg border border-border bg-card">
                <div className="flex items-center gap-3 p-3">
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setExpanded(isOpen ? null : g.key)}
                    aria-label="Toggle orders"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{g.name}</span>
                      {i === 0 && (
                        <Badge variant="warn" className="gap-1">
                          <Crown className="h-3 w-3" /> Top
                        </Badge>
                      )}
                      <Badge variant="default">{g.count}× orders</Badge>
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {g.email || g.phone || "—"} · {g.products.length} product
                      {g.products.length === 1 ? "" : "s"}
                      {avgGap != null ? ` · ~${avgGap}d between orders` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">
                      {fmtMoney(g.total, g.currency)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">LTV</div>
                  </div>
                  <Button size="sm" onClick={() => upsell(g)} disabled={!g.email || sending === g.key}>
                    <Send /> {sending === g.key ? "Sending…" : "Upsell"}
                  </Button>
                </div>
                {isOpen && (
                  <div className="border-t border-border/60 px-4 py-2">
                    {g.orders
                      .slice()
                      .sort((a, b) => Date.parse(String(b.timestamp || "")) - Date.parse(String(a.timestamp || "")))
                      .map((o, j) => (
                        <div
                          key={j}
                          className="flex items-center justify-between gap-3 py-1 text-xs"
                        >
                          <span className="text-muted-foreground">{fmtDate(o.timestamp)}</span>
                          <span className="min-w-0 flex-1 truncate">{o.productName ?? o.sku ?? "—"}</span>
                          <span className="tabular-nums">{fmtMoney(orderValue(o), orderCurrency(o))}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <ToastHost toasts={toasts} />
    </div>
  );
}
