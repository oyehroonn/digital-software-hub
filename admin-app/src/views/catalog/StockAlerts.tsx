/**
 * LOW / OUT-OF-STOCK alerts. Flags every product at or below the low-stock
 * threshold, out-of-stock first, with a one-click restock (queued offline).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, PackageX, PlusCircle, RefreshCw } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { enqueueEdit } from "@/lib/offlineQueue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { fmtMoney } from "@/lib/utils";
import {
  loadCatalog,
  priceNumber,
  stockNumber,
  LOW_STOCK_THRESHOLD,
  type CatProduct,
} from "./catalogData";
import { SeedBanner, ViewHeader, Notice, StatTile } from "./catalogUI";

export function StockAlerts({
  config,
  vpsUp,
  products: productsProp,
  seeded: seededProp,
}: {
  config: AppConfig;
  vpsUp: boolean;
  products?: CatProduct[];
  seeded?: boolean;
}) {
  const selfLoad = productsProp === undefined;
  const [products, setProducts] = useState<CatProduct[]>(productsProp ?? []);
  const [seeded, setSeeded] = useState(!!seededProp);
  const [loading, setLoading] = useState(false);
  const [threshold, setThreshold] = useState(LOW_STOCK_THRESHOLD);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selfLoad) return;
    setLoading(true);
    const res = await loadCatalog(config);
    setProducts(res.products);
    setSeeded(res.seeded);
    setLoading(false);
  }, [config, selfLoad]);

  useEffect(() => {
    if (selfLoad) load();
  }, [selfLoad, load]);
  useEffect(() => {
    if (productsProp !== undefined) setProducts(productsProp);
  }, [productsProp]);
  useEffect(() => {
    if (seededProp !== undefined) setSeeded(seededProp);
  }, [seededProp]);

  const rows = useMemo(() => {
    return products
      .map((p) => ({ p, stock: stockNumber(p) }))
      .filter((r) => r.stock != null && r.stock <= threshold)
      .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
  }, [products, threshold]);

  const outCount = rows.filter((r) => (r.stock ?? 0) === 0).length;
  const atRisk = rows.reduce((s, r) => s + (priceNumber(r.p) ?? 0), 0);

  function restock(p: CatProduct, qty: number) {
    enqueueEdit(p.id, { stock: (stockNumber(p) ?? 0) + qty, status: "active" }, p.name);
    setProducts((ps) =>
      ps.map((x) =>
        x.id === p.id ? { ...x, stock: (stockNumber(x) ?? 0) + qty, status: "active" } : x,
      ),
    );
    setNotice(`Restock of ${qty} queued for ${p.name} — ${vpsUp ? "pushing…" : "will auto-push"}`);
    setTimeout(() => setNotice(null), 2500);
  }

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Stock alerts"
        subtitle="Products at or below your low-stock threshold. Restock in one click — queued and auto-pushed to the VPS."
        right={
          <>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Threshold
              <Input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(Math.max(0, Number(e.target.value)))}
                className="h-8 w-16"
              />
            </label>
            {selfLoad && (
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
              </Button>
            )}
          </>
        }
      />
      <SeedBanner show={seeded} />
      <Notice msg={notice} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<PackageX className="h-4 w-4" />}
          label="Out of stock"
          value={outCount.toLocaleString()}
          tone={outCount ? "down" : "ok"}
        />
        <StatTile
          icon={<AlertTriangle className="h-4 w-4" />}
          label={`Low (≤${threshold})`}
          value={rows.length.toLocaleString()}
          tone={rows.length ? "warn" : "ok"}
        />
        <StatTile
          label="Catalog size"
          value={products.length.toLocaleString()}
        />
        <StatTile
          label="Sale value at risk"
          value={fmtMoney(atRisk)}
          sub="Sum of listed price on flagged rows"
        />
      </div>

      {rows.length === 0 && !loading ? (
        <Empty
          icon={<PackageX className="h-8 w-8" />}
          title="Nothing low on stock"
          hint={`No product is at or below ${threshold}.`}
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>Category</TH>
                <TH className="text-right">Price</TH>
                <TH className="text-right">Stock</TH>
                <TH className="text-right">Restock</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ p, stock }) => (
                <TR key={String(p.id)}>
                  <TD className="max-w-sm">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      #{String(p.id)}
                      {p.sku ? ` · ${p.sku}` : ""}
                    </div>
                  </TD>
                  <TD className="text-muted-foreground">{p.category ?? "—"}</TD>
                  <TD className="text-right tabular-nums">
                    {priceNumber(p) != null ? fmtMoney(priceNumber(p) as number) : "—"}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {stock === 0 ? (
                      <Badge variant="down">Out</Badge>
                    ) : (
                      <span className="text-warn">{stock}</span>
                    )}
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      {[10, 50, 100].map((q) => (
                        <Button key={q} variant="ghost" size="sm" onClick={() => restock(p, q)}>
                          <PlusCircle className="h-3.5 w-3.5" />
                          {q}
                        </Button>
                      ))}
                    </div>
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
