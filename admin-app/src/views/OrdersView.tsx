import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCw, Search } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchOrders, type Order } from "@/lib/ecommerce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { fmtMoney, timeAgo } from "@/lib/utils";

export function OrdersView({ config }: { config: AppConfig }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchOrders(config);
      setOrders(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!q) return orders;
    const t = q.toLowerCase();
    return orders.filter((o) =>
      [o.customerName, o.email, o.productName, o.sku, o.city, o.country]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t)),
    );
  }, [orders, q]);

  const revenue = useMemo(
    () =>
      filtered.reduce((sum, o) => {
        const p = parseFloat(String(o.price ?? "").replace(/[^0-9.]/g, "")) || 0;
        const qy = parseFloat(String(o.quantity ?? 1)) || 1;
        return sum + p * qy;
      }, 0),
    [filtered],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Orders</h1>
          <p className="text-xs text-muted-foreground">
            Live from the stable Orders sheet (Apps Script) — always available.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search orders…"
              className="w-56 pl-8"
            />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        <Stat label="Orders" value={String(filtered.length)} />
        <Stat label="Revenue" value={fmtMoney(revenue)} />
      </div>

      {error ? (
        <Empty
          title="Couldn't load orders"
          hint={`Check the Apps Script URL and secret in Settings. (${error})`}
        />
      ) : filtered.length === 0 && !loading ? (
        <Empty icon={<ClipboardList className="h-8 w-8" />} title="No orders yet" />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Customer</TH>
                <TH>Product</TH>
                <TH className="text-right">Qty</TH>
                <TH className="text-right">Price</TH>
                <TH>Destination</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((o, i) => (
                <TR key={i}>
                  <TD className="whitespace-nowrap text-muted-foreground" title={o.timestamp}>
                    {o.timestamp ? timeAgo(o.timestamp) : "—"}
                  </TD>
                  <TD>
                    <div className="font-medium">{o.customerName ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{o.email ?? ""}</div>
                  </TD>
                  <TD className="max-w-xs">
                    <div className="truncate">{o.productName ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{o.sku ?? ""}</div>
                  </TD>
                  <TD className="text-right tabular-nums">{o.quantity ?? 1}</TD>
                  <TD className="text-right tabular-nums">
                    {o.price != null ? fmtMoney(o.price, o.currency || "USD") : "—"}
                  </TD>
                  <TD className="text-muted-foreground">
                    {[o.city, o.country].filter(Boolean).join(", ") || "—"}
                  </TD>
                  <TD>
                    <Badge variant={/complete|paid|fulfilled/i.test(String(o.status)) ? "ok" : "muted"}>
                      {o.status ?? "new"}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
