import { useEffect, useMemo, useState } from "react";
import { Database, Search, Users, ShoppingBag, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/Empty";

/**
 * Legacy (WooCommerce) — customers & orders migrated from the old
 * digitalsoftwaremarkett.com store (WooCommerce REST export). Read-only snapshot
 * bundled under /public/legacy so the admin surfaces the historical book of
 * business alongside the live Orders/Telemetry data. Does NOT touch live sheets.
 */

interface WooCustomer {
  id: number; email: string; name?: string; username?: string; created?: string;
  role?: string; orders_count?: number; total_spent?: string; city?: string;
  country?: string; phone?: string;
}
interface WooOrder {
  id: number; number?: string; status?: string; email?: string; name?: string;
  total?: string; currency?: string; created?: string; paid?: string;
  items?: { name: string; qty: number; total: string }[]; payment?: string; customer_id?: number;
}

const PAGE = 50;
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fdate = (s?: string) => (s ? s.slice(0, 10) : "—");

const statusTone: Record<string, "ok" | "warn" | "down" | "muted" | "default"> = {
  completed: "ok", processing: "default", "on-hold": "warn",
  cancelled: "down", refunded: "down", failed: "down",
};

export function LegacyWoo() {
  const [customers, setCustomers] = useState<WooCustomer[] | null>(null);
  const [orders, setOrders] = useState<WooOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"customers" | "orders">("customers");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const base = import.meta.env.BASE_URL || "/";
    Promise.all([
      fetch(`${base}legacy/woo-customers.json`).then((r) => r.json()),
      fetch(`${base}legacy/woo-orders.json`).then((r) => r.json()),
    ])
      .then(([c, o]) => { setCustomers(c); setOrders(o); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const stats = useMemo(() => {
    if (!customers || !orders) return null;
    const rev: Record<string, number> = {};
    const prod: Record<string, number> = {};
    for (const o of orders) {
      if (["completed", "processing", "on-hold"].includes(o.status || "")) {
        rev[o.currency || "?"] = (rev[o.currency || "?"] || 0) + Number(o.total || 0);
      }
      for (const it of o.items || []) prod[it.name] = (prod[it.name] || 0) + Number(it.qty || 1);
    }
    const topProd = Object.entries(prod).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { rev, topProd };
  }, [customers, orders]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (tab === "customers") {
      const rows = customers || [];
      return t ? rows.filter((c) => `${c.email} ${c.name} ${c.username} ${c.country}`.toLowerCase().includes(t)) : rows;
    }
    const rows = orders || [];
    return t ? rows.filter((o) => `${o.email} ${o.name} ${o.number} ${o.status}`.toLowerCase().includes(t)) : rows;
  }, [tab, q, customers, orders]);

  useEffect(() => setPage(0), [tab, q]);

  if (error) return <Empty icon={<Database className="size-5" />} title="Couldn't load legacy export" hint={error} />;
  if (!customers || !orders || !stats) return <Empty icon={<Database className="size-5" />} title="Loading legacy WooCommerce data…" />;

  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.ceil(filtered.length / PAGE);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Database className="size-4 text-muted-foreground" /> Legacy · WooCommerce
        </h1>
        <p className="text-xs text-muted-foreground">
          Read-only snapshot migrated from the old digitalsoftwaremarkett.com store. Historical customers &amp; orders — separate from live data.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={<Users className="size-4" />} label="Customers" value={customers.length.toLocaleString()} />
        <Kpi icon={<ShoppingBag className="size-4" />} label="Orders" value={orders.length.toLocaleString()} />
        {Object.entries(stats.rev).map(([cur, v]) => (
          <Kpi key={cur} icon={<Package className="size-4" />} label={`Revenue (${cur})`} value={`${cur} ${money(v)}`} />
        ))}
      </div>

      {/* top products */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Top products (by units sold)</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {stats.topProd.map(([name, n]) => (
            <Badge key={name} variant="muted" className="font-normal">{name} · {n}</Badge>
          ))}
        </CardContent>
      </Card>

      {/* controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-border p-1">
          <Button size="sm" variant={tab === "customers" ? "default" : "ghost"} onClick={() => setTab("customers")}>
            Customers <span className="ml-1 opacity-60">{customers.length}</span>
          </Button>
          <Button size="sm" variant={tab === "orders" ? "default" : "ghost"} onClick={() => setTab("orders")}>
            Orders <span className="ml-1 opacity-60">{orders.length}</span>
          </Button>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${tab}…`} className="pl-8" />
        </div>
      </div>

      {/* table */}
      {tab === "customers" ? (
        <Table>
          <THead><TR><TH>Email</TH><TH>Name</TH><TH>Country</TH><TH>Registered</TH></TR></THead>
          <TBody>
            {(pageRows as WooCustomer[]).map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.email}</TD>
                <TD className="text-muted-foreground">{c.name || "—"}</TD>
                <TD>{c.country || "—"}</TD>
                <TD className="text-muted-foreground">{fdate(c.created)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <Table>
          <THead><TR><TH>Order</TH><TH>Customer</TH><TH>Status</TH><TH>Total</TH><TH>Items</TH><TH>Date</TH></TR></THead>
          <TBody>
            {(pageRows as WooOrder[]).map((o) => (
              <TR key={o.id}>
                <TD className="font-medium">#{o.number || o.id}</TD>
                <TD className="text-muted-foreground">{o.email || o.name || "—"}</TD>
                <TD><Badge variant={statusTone[o.status || ""] || "muted"} className="font-normal">{o.status}</Badge></TD>
                <TD className="tabular-nums">{o.currency} {Number(o.total || 0).toLocaleString()}</TD>
                <TD className="max-w-[22ch] truncate text-muted-foreground" title={(o.items || []).map((i) => `${i.name} x${i.qty}`).join(", ")}>
                  {(o.items || []).map((i) => i.name).join(", ") || "—"}
                </TD>
                <TD className="text-muted-foreground">{fdate(o.created)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {/* pager */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filtered.length.toLocaleString()} {tab}{q ? " (filtered)" : ""}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span>{page + 1} / {Math.max(1, pages)}</span>
          <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

export default LegacyWoo;
