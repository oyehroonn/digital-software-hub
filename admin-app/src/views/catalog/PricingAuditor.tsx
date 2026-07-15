/**
 * "CONTACT FOR PRICING" auditor. Every price-less product is a silent conversion
 * leak — a visitor who has to email for a number usually leaves. This lists them,
 * ranks by demand (telemetry views, so you fix the money-makers first), and lets
 * you set a price inline (queued offline).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { DollarSign, RefreshCw, Tag } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { enqueueEdit } from "@/lib/offlineQueue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { loadCatalog, loadPerformance, isPriceless, type CatProduct } from "./catalogData";
import { SeedBanner, ViewHeader, Notice, StatTile, Sparkline } from "./catalogUI";

export function PricingAuditor({
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
  const [notice, setNotice] = useState<string | null>(null);
  const [views, setViews] = useState<Map<string, { views: number; spark: number[] }>>(new Map());

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

  // Demand signal (independent of catalog source; degrades to empty silently).
  useEffect(() => {
    let alive = true;
    loadPerformance(config)
      .then((r) => {
        if (!alive) return;
        const m = new Map<string, { views: number; spark: number[] }>();
        for (const s of r.stats) m.set(String(s.productId), { views: s.views, spark: s.spark });
        setViews(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [config]);

  const rows = useMemo(() => {
    return products
      .filter(isPriceless)
      .map((p) => ({ p, demand: views.get(String(p.id)) }))
      .sort((a, b) => (b.demand?.views ?? 0) - (a.demand?.views ?? 0));
  }, [products, views]);

  const lostDemand = rows.reduce((s, r) => s + (r.demand?.views ?? 0), 0);

  function setPrice(p: CatProduct, price: string) {
    const n = parseFloat(price);
    if (!Number.isFinite(n) || n <= 0) return;
    enqueueEdit(p.id, { price: n }, p.name);
    setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, price: n } : x)));
    setNotice(`Price ${n} queued for ${p.name} — ${vpsUp ? "pushing…" : "will auto-push"}`);
    setTimeout(() => setNotice(null), 2500);
  }

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Contact-for-pricing auditor"
        subtitle="Products with no listed price make visitors email to buy — the biggest silent conversion leak. Fix the highest-demand ones first."
        right={
          selfLoad && (
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          )
        }
      />
      <SeedBanner show={seeded} />
      <Notice msg={notice} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<Tag className="h-4 w-4" />}
          label="Price-less products"
          value={rows.length.toLocaleString()}
          tone={rows.length ? "warn" : "ok"}
        />
        <StatTile
          label="Priced coverage"
          value={`${products.length ? Math.round(((products.length - rows.length) / products.length) * 100) : 0}%`}
        />
        <StatTile
          icon={<DollarSign className="h-4 w-4" />}
          label="Views on price-less"
          value={lostDemand.toLocaleString()}
          sub="Demand that hits a dead end"
          tone={lostDemand ? "down" : undefined}
        />
        <StatTile label="Catalog size" value={products.length.toLocaleString()} />
      </div>

      {rows.length === 0 && !loading ? (
        <Empty
          icon={<Tag className="h-8 w-8" />}
          title="Every product has a price"
          hint="No 'Contact for pricing' leaks — nice."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>Category</TH>
                <TH className="text-right">Views</TH>
                <TH className="text-right">Trend</TH>
                <TH className="text-right">Set price</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ p, demand }) => (
                <PricelessRow
                  key={String(p.id)}
                  p={p}
                  views={demand?.views ?? 0}
                  spark={demand?.spark ?? []}
                  onSet={(v) => setPrice(p, v)}
                />
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function PricelessRow({
  p,
  views,
  spark,
  onSet,
}: {
  p: CatProduct;
  views: number;
  spark: number[];
  onSet: (v: string) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <TR>
      <TD className="max-w-sm">
        <div className="truncate font-medium">{p.name}</div>
        <div className="text-[11px] text-muted-foreground">
          #{String(p.id)}
          {p.sku ? ` · ${p.sku}` : ""}
        </div>
      </TD>
      <TD className="text-muted-foreground">{p.category ?? "—"}</TD>
      <TD className="text-right tabular-nums">
        {views > 0 ? views.toLocaleString() : <Badge variant="muted">no data</Badge>}
      </TD>
      <TD className="text-right">
        <div className="flex justify-end">
          <Sparkline data={spark} />
        </div>
      </TD>
      <TD className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (onSet(val), setVal(""))}
            type="number"
            placeholder="0.00"
            className="h-8 w-24 text-right"
          />
          <Button size="sm" onClick={() => (onSet(val), setVal(""))} disabled={!val}>
            Set
          </Button>
        </div>
      </TD>
    </TR>
  );
}
