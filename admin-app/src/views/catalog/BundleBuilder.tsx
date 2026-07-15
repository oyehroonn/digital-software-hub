/**
 * CROSS-SELL / bundle builder. Pick a primary product and the tool suggests the
 * best companions from real telemetry ("customers who viewed X also viewed Y"),
 * then lets you assemble a bundle, apply a discount, and see the bundle price vs
 * the sum of parts. Bundles persist locally and the primary's cross-sell list is
 * pushed to the VPS (offline-queued) so the shop can show "Frequently bought
 * together".
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Link2, Plus, RefreshCw, Save, Sparkles, Trash2, X } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { TelemetryEvent } from "@/lib/ecommerce";
import { enqueueEdit } from "@/lib/offlineQueue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney } from "@/lib/utils";
import {
  loadCatalog,
  loadPerformance,
  crossSellMap,
  priceNumber,
  type CatProduct,
  type Affinity,
} from "./catalogData";
import { SeedBanner, ViewHeader, Notice } from "./catalogUI";

const BUNDLES_KEY = "dsm-admin.catalog.bundles";

interface Bundle {
  id: string;
  name: string;
  productIds: (string | number)[];
  discountPct: number;
  createdAt: number;
}

function loadBundles(): Bundle[] {
  try {
    return JSON.parse(localStorage.getItem(BUNDLES_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveBundles(b: Bundle[]) {
  localStorage.setItem(BUNDLES_KEY, JSON.stringify(b));
}

export function BundleBuilder({
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
  const [affinity, setAffinity] = useState<Map<string, Affinity[]>>(new Map());

  const [name, setName] = useState("New bundle");
  const [picked, setPicked] = useState<(string | number)[]>([]);
  const [discount, setDiscount] = useState(15);
  const [bundles, setBundles] = useState<Bundle[]>(loadBundles());

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

  useEffect(() => {
    let alive = true;
    loadPerformance(config)
      .then((r) => alive && setAffinity(crossSellMap(r.events as TelemetryEvent[])))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [config]);

  const byId = useMemo(() => {
    const m = new Map<string, CatProduct>();
    for (const p of products) m.set(String(p.id), p);
    return m;
  }, [products]);

  const pickedProducts = picked.map((id) => byId.get(String(id))).filter(Boolean) as CatProduct[];

  // Cross-sell suggestions: companions of everything already picked, ranked by
  // co-view strength, excluding what's already in the bundle.
  const suggestions = useMemo(() => {
    const score = new Map<string, number>();
    for (const id of picked) {
      for (const a of affinity.get(String(id)) ?? []) {
        if (picked.some((p) => String(p) === a.productId)) continue;
        score.set(a.productId, (score.get(a.productId) ?? 0) + a.together);
      }
    }
    return [...score.entries()]
      .map(([pid, together]) => ({ p: byId.get(pid), together }))
      .filter((x) => x.p)
      .sort((a, b) => b.together - a.together)
      .slice(0, 6) as { p: CatProduct; together: number }[];
  }, [picked, affinity, byId]);

  const sumParts = pickedProducts.reduce((s, p) => s + (priceNumber(p) ?? 0), 0);
  const bundlePrice = Math.round(sumParts * (1 - discount / 100) * 100) / 100;
  const savings = sumParts - bundlePrice;

  function toggle(id: string | number) {
    setPicked((cur) =>
      cur.some((x) => String(x) === String(id))
        ? cur.filter((x) => String(x) !== String(id))
        : [...cur, id],
    );
  }

  function persist(next: Bundle[]) {
    setBundles(next);
    saveBundles(next);
  }

  function saveBundle() {
    if (pickedProducts.length < 2) return;
    const b: Bundle = {
      id: `bnd-${Date.now().toString(36)}`,
      name: name.trim() || "Bundle",
      productIds: [...picked],
      discountPct: discount,
      createdAt: Date.now(),
    };
    persist([b, ...bundles]);
    // Push cross-sell links onto the primary product so the shop can render
    // "Frequently bought together" (offline-queued).
    const [primary, ...rest] = picked;
    if (primary != null) {
      const prod = byId.get(String(primary));
      enqueueEdit(primary, { crossSell: rest }, prod?.name);
    }
    setNotice(
      `Bundle "${b.name}" saved · cross-sell links queued — ${vpsUp ? "pushing…" : "will auto-push"}`,
    );
    setTimeout(() => setNotice(null), 3000);
    setPicked([]);
    setName("New bundle");
  }

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Cross-sell & bundle builder"
        subtitle="Companions suggested from real co-view telemetry. Assemble a discounted bundle and push 'frequently bought together' links to the shop."
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

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Catalog picker */}
        <Card>
          <CardHeader>
            <CardTitle>Catalog — click to add / remove</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[26rem] overflow-y-auto pt-0">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {products.map((p) => {
                const on = picked.some((x) => String(x) === String(p.id));
                return (
                  <button
                    key={String(p.id)}
                    onClick={() => toggle(p.id)}
                    className={`flex flex-col items-start gap-1 rounded-md border p-2 text-left text-xs transition-colors ${
                      on ? "border-primary bg-primary/10" : "border-border hover:bg-accent/50"
                    }`}
                  >
                    <span className="line-clamp-2 font-medium">{p.name}</span>
                    <span className="text-muted-foreground">
                      {priceNumber(p) != null ? fmtMoney(priceNumber(p) as number) : "Contact"}
                    </span>
                    {on && <Badge variant="default">In bundle</Badge>}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Bundle panel */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>This bundle</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bundle name" />
              {pickedProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add products from the catalog to start a bundle.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {pickedProducts.map((p) => (
                    <div
                      key={String(p.id)}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {priceNumber(p) != null ? fmtMoney(priceNumber(p) as number) : "—"}
                      </span>
                      <button onClick={() => toggle(p.id)} className="text-muted-foreground hover:text-down">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <label className="flex items-center justify-between text-xs text-muted-foreground">
                Bundle discount
                <span className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                  />
                  <span className="w-8 text-right tabular-nums text-foreground">{discount}%</span>
                </span>
              </label>

              <div className="rounded-md border border-border bg-background p-3 text-sm">
                <Row label="Sum of parts" value={fmtMoney(sumParts)} muted />
                <Row label={`Bundle (−${discount}%)`} value={fmtMoney(bundlePrice)} strong />
                <Row label="Customer saves" value={fmtMoney(savings)} tone="ok" />
              </div>

              <Button disabled={pickedProducts.length < 2} onClick={saveBundle}>
                <Save className="h-4 w-4" /> Save bundle & queue cross-sell
              </Button>
            </CardContent>
          </Card>

          {/* Suggestions */}
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle>Suggested companions</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {suggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {picked.length === 0
                    ? "Add a product to see co-view suggestions."
                    : "No co-view data for the current selection."}
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {suggestions.map(({ p, together }) => (
                    <div
                      key={String(p.id)}
                      className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
                    >
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <Badge variant="muted" className="gap-1">
                        {together}× together
                      </Badge>
                      <button onClick={() => toggle(p.id)} className="text-primary hover:opacity-80">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Saved bundles */}
      <Card>
        <CardHeader>
          <CardTitle>Saved bundles</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {bundles.length === 0 ? (
            <Empty icon={<Boxes className="h-8 w-8" />} title="No bundles saved yet" />
          ) : (
            <div className="flex flex-col gap-2">
              {bundles.map((b) => {
                const items = b.productIds
                  .map((id) => byId.get(String(id)))
                  .filter(Boolean) as CatProduct[];
                const parts = items.reduce((s, p) => s + (priceNumber(p) ?? 0), 0);
                const price = Math.round(parts * (1 - b.discountPct / 100) * 100) / 100;
                return (
                  <div
                    key={b.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{b.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {items.map((p) => p.name).join(" + ") || `${b.productIds.length} items`}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums">{fmtMoney(price)}</div>
                        <div className="text-[11px] text-muted-foreground">−{b.discountPct}%</div>
                      </div>
                      <button
                        onClick={() => persist(bundles.filter((x) => x.id !== b.id))}
                        className="text-muted-foreground hover:text-down"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  tone?: "ok";
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={`text-xs ${muted ? "text-muted-foreground" : ""}`}>{label}</span>
      <span
        className={`tabular-nums ${strong ? "text-base font-semibold" : "text-sm"} ${
          tone === "ok" ? "text-ok" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
