/**
 * DUPLICATE / variation cleanup. Groups products whose base name collides after
 * stripping edition/version noise ("DSM", "DSM Professional Edition", "DSM v2"
 * → one group). For each group you pick a primary to keep and archive the rest
 * (queued offline as a status change) — turning a messy variant sprawl into a
 * clean parent with editions.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Layers, RefreshCw, Archive } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { enqueueEdit } from "@/lib/offlineQueue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney } from "@/lib/utils";
import { loadCatalog, findDuplicates, priceNumber, type CatProduct, type DupGroup } from "./catalogData";
import { SeedBanner, ViewHeader, Notice, StatTile } from "./catalogUI";

export function DuplicateCleanup({
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
  const [resolved, setResolved] = useState<Set<string>>(new Set());

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

  const groups = useMemo(() => findDuplicates(products), [products]);
  const dupTotal = groups.reduce((s, g) => s + g.members.length, 0);

  function archiveOthers(group: DupGroup, keepId: CatProduct["id"]) {
    const others = group.members.filter((m) => m.id !== keepId);
    for (const m of others) enqueueEdit(m.id, { status: "archived" }, m.name);
    setProducts((ps) =>
      ps.map((x) => (others.some((o) => o.id === x.id) ? { ...x, status: "archived" } : x)),
    );
    setResolved((s) => new Set(s).add(group.base));
    setNotice(
      `Kept "${group.members.find((m) => m.id === keepId)?.name}", archived ${others.length} variant${
        others.length === 1 ? "" : "s"
      } — ${vpsUp ? "pushing…" : "will auto-push"}`,
    );
    setTimeout(() => setNotice(null), 3000);
  }

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Duplicate & variation cleanup"
        subtitle="Products sharing a base name (editions, versions, re-uploads) grouped together. Keep one primary; archive the rest — queued offline."
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          icon={<Layers className="h-4 w-4" />}
          label="Duplicate groups"
          value={groups.length.toLocaleString()}
          tone={groups.length ? "warn" : "ok"}
        />
        <StatTile
          icon={<Copy className="h-4 w-4" />}
          label="Products involved"
          value={dupTotal.toLocaleString()}
        />
        <StatTile
          label="Catalog size"
          value={products.length.toLocaleString()}
        />
      </div>

      {groups.length === 0 && !loading ? (
        <Empty
          icon={<Layers className="h-8 w-8" />}
          title="No duplicates detected"
          hint="No two products share a base name after stripping edition/version words."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <DupGroupCard
              key={g.base}
              group={g}
              resolved={resolved.has(g.base)}
              onKeep={(id) => archiveOthers(g, id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DupGroupCard({
  group,
  resolved,
  onKeep,
}: {
  group: DupGroup;
  resolved: boolean;
  onKeep: (id: CatProduct["id"]) => void;
}) {
  // Default primary suggestion: the cheapest priced member (usually the base
  // edition), else the first.
  const suggested =
    [...group.members]
      .filter((m) => priceNumber(m) != null)
      .sort((a, b) => (priceNumber(a) as number) - (priceNumber(b) as number))[0] ??
    group.members[0];
  const [keepId, setKeepId] = useState<CatProduct["id"]>(suggested.id);

  return (
    <Card className={resolved ? "opacity-60" : undefined}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="capitalize">
          {group.base}{" "}
          <span className="ml-1 font-normal text-muted-foreground">
            ({group.members.length} variants)
          </span>
        </CardTitle>
        {resolved ? (
          <Badge variant="ok">Resolved</Badge>
        ) : (
          <Button size="sm" onClick={() => onKeep(keepId)}>
            <Archive className="h-3.5 w-3.5" /> Keep selected, archive rest
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 pt-0">
        {group.members.map((m) => {
          const isKeep = m.id === keepId;
          return (
            <label
              key={String(m.id)}
              className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                isKeep ? "border-ok/40 bg-ok/5" : "border-border"
              }`}
            >
              <input
                type="radio"
                name={`keep-${group.base}`}
                checked={isKeep}
                disabled={resolved}
                onChange={() => setKeepId(m.id)}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{m.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  #{String(m.id)}
                  {m.licenseType ? ` · ${m.licenseType}` : ""}
                  {m.sku ? ` · ${m.sku}` : ""}
                </div>
              </div>
              <div className="text-right text-xs tabular-nums text-muted-foreground">
                {priceNumber(m) != null ? fmtMoney(priceNumber(m) as number) : "—"}
              </div>
              {isKeep ? (
                <Badge variant="ok">Keep</Badge>
              ) : (
                <Badge variant="muted">{resolved ? "Archived" : "Archive"}</Badge>
              )}
            </label>
          );
        })}
      </CardContent>
    </Card>
  );
}
