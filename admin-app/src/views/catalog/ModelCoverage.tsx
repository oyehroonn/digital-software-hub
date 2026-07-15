/**
 * BOX / 3D-model coverage report. The DSM shop sells its products as 3D "boxes";
 * a product with no model renders a broken box on the site. This reports coverage
 * by category and lists every product missing a model, with one-click regen
 * (queued offline via the box-regen endpoint).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Boxes, CheckCircle2, RefreshCw } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { enqueueRegen } from "@/lib/offlineQueue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCatalog, hasModel, type CatProduct } from "./catalogData";
import { SeedBanner, ViewHeader, Notice, StatTile } from "./catalogUI";

interface CatCoverage {
  category: string;
  total: number;
  covered: number;
}

export function ModelCoverage({
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
  const [queued, setQueued] = useState<Set<string>>(new Set());

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

  const missing = useMemo(() => products.filter((p) => !hasModel(p)), [products]);
  const covered = products.length - missing.length;
  const pct = products.length ? Math.round((covered / products.length) * 100) : 0;

  const byCategory = useMemo<CatCoverage[]>(() => {
    const m = new Map<string, CatCoverage>();
    for (const p of products) {
      const cat = p.category ?? "Uncategorized";
      const c = m.get(cat) ?? { category: cat, total: 0, covered: 0 };
      c.total++;
      if (hasModel(p)) c.covered++;
      m.set(cat, c);
    }
    return [...m.values()].sort((a, b) => a.covered / a.total - b.covered / b.total);
  }, [products]);

  function regen(p: CatProduct) {
    enqueueRegen(p.id, p.name);
    setQueued((s) => new Set(s).add(String(p.id)));
    setNotice(`Box regen queued for ${p.name} — ${vpsUp ? "pushing…" : "will auto-push"}`);
    setTimeout(() => setNotice(null), 2500);
  }

  function regenAll() {
    for (const p of missing) enqueueRegen(p.id, p.name);
    setQueued(new Set(missing.map((p) => String(p.id))));
    setNotice(`${missing.length} box regens queued — ${vpsUp ? "pushing…" : "will auto-push"}`);
    setTimeout(() => setNotice(null), 3000);
  }

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="3D box / model coverage"
        subtitle="A product with no 3D model renders a broken box on the shop. Regenerate missing boxes here — queued to the VPS regen endpoint."
        right={
          <>
            <Button size="sm" disabled={missing.length === 0} onClick={regenAll}>
              <Boxes className="h-3.5 w-3.5" /> Regen all missing ({missing.length})
            </Button>
            {selfLoad && (
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
              </Button>
            )}
          </>
        }
      />
      <SeedBanner show={seeded} what="catalog" />
      <Notice msg={notice} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Coverage"
          value={`${pct}%`}
          tone={pct >= 90 ? "ok" : pct >= 60 ? "warn" : "down"}
        />
        <StatTile icon={<Box className="h-4 w-4" />} label="With model" value={covered.toLocaleString()} />
        <StatTile
          label="Missing model"
          value={missing.length.toLocaleString()}
          tone={missing.length ? "warn" : "ok"}
        />
        <StatTile label="Catalog size" value={products.length.toLocaleString()} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coverage by category</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {byCategory.map((c) => {
            const p = Math.round((c.covered / c.total) * 100);
            return (
              <div key={c.category} className="flex items-center gap-3">
                <div className="w-40 truncate text-xs text-muted-foreground">{c.category}</div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${p >= 90 ? "bg-ok" : p >= 60 ? "bg-warn" : "bg-down"}`}
                    style={{ width: `${p}%` }}
                  />
                </div>
                <div className="w-24 text-right text-xs tabular-nums">
                  {c.covered}/{c.total} · {p}%
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {missing.length === 0 && !loading ? (
        <Empty
          icon={<CheckCircle2 className="h-8 w-8" />}
          title="Full 3D coverage"
          hint="Every product has a model — no broken boxes."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Product missing a model</TH>
                <TH>Category</TH>
                <TH>Status</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {missing.map((p) => (
                <TR key={String(p.id)}>
                  <TD className="max-w-sm">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">#{String(p.id)}</div>
                  </TD>
                  <TD className="text-muted-foreground">{p.category ?? "—"}</TD>
                  <TD>
                    <Badge variant={p.status === "active" ? "ok" : "muted"}>
                      {p.status ?? "unknown"}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    {queued.has(String(p.id)) ? (
                      <Badge variant="ok">Queued</Badge>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => regen(p)}>
                        <Boxes className="h-3.5 w-3.5" /> Regen box
                      </Button>
                    )}
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
