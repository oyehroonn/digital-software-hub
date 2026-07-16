/**
 * Quote desk — pick any order and fire a tailored quote email in one click.
 * Also the home of the order → OLD-WEB deep link + copy actions for every order.
 */
import { useMemo, useState } from "react";
import { RefreshCw, Search, Mail, ExternalLink, Copy, Package } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order } from "@/lib/ecommerce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { fmtMoney, timeAgo } from "@/lib/utils";
import { SectionHeader, ToastHost, useToasts } from "./parts";
import { QuoteComposer } from "./QuoteComposer";
import { copyToClipboard } from "./orderEmail";
import {
  useOrdersData,
  orderKey,
  orderValue,
  orderCurrency,
  customerLabel,
  orderDeepLink,
  productDeepLink,
} from "./ordersData";

export function QuoteDesk({ config }: { config: AppConfig }) {
  const { orders, loading, reload } = useOrdersData(config);
  const { toasts, push } = useToasts();
  const [q, setQ] = useState("");
  const [quoteFor, setQuoteFor] = useState<Order | null>(null);

  const filtered = useMemo(() => {
    if (!q) return orders;
    const t = q.toLowerCase();
    return orders.filter((o) =>
      [o.customerName, o.email, o.productName, o.sku, o.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t)),
    );
  }, [orders, q]);

  const copyLink = async (url: string, label: string) => {
    const ok = await copyToClipboard(url);
    push(ok ? `${label} link copied.` : "Copy failed.", ok ? "ok" : "down");
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Quote desk"
        subtitle="Send a tailored quote for any order, and jump to the order or product in the old web."
        right={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search orders…" className="w-56 pl-8" />
            </div>
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          </>
        }
      />

      {filtered.length === 0 && !loading ? (
        <Empty title="No orders" />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Customer</TH>
                <TH>Product</TH>
                <TH className="text-right">Value</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((o) => (
                <TR key={orderKey(o)}>
                  <TD className="whitespace-nowrap text-muted-foreground" title={o.timestamp}>
                    {o.timestamp ? timeAgo(o.timestamp) : "—"}
                  </TD>
                  <TD>
                    <div className="font-medium">{customerLabel(o)}</div>
                    <div className="text-[11px] text-muted-foreground">{o.email ?? ""}</div>
                  </TD>
                  <TD className="max-w-[220px] truncate">{o.productName ?? o.sku ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{fmtMoney(orderValue(o), orderCurrency(o))}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" onClick={() => setQuoteFor(o)}>
                        <Mail /> Quote
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        title="Open order in old web"
                        onClick={() => window.open(orderDeepLink(o), "_blank")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        title="Copy old-web order link"
                        onClick={() => copyLink(orderDeepLink(o), "Order")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        title="Open product in old web"
                        onClick={() => window.open(productDeepLink(o), "_blank")}
                      >
                        <Package className="h-4 w-4" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <QuoteComposer
        config={config}
        order={quoteFor}
        open={quoteFor != null}
        onClose={() => setQuoteFor(null)}
        onSent={(msg, ok) => push(msg, ok ? "ok" : "down")}
      />
      <ToastHost toasts={toasts} />
    </div>
  );
}
