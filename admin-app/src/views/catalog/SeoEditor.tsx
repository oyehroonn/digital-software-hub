/**
 * Per-product SEO / meta editor. Edit the SEO title, meta description and URL
 * slug with a live Google-style SERP preview and length guidance, plus a catalog
 * health list that surfaces products with missing/too-short/too-long meta. Saves
 * queue offline.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Search, Wand2 } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { ProductEdit } from "@/lib/products";
import { enqueueEdit } from "@/lib/offlineQueue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCatalog, type CatProduct } from "./catalogData";
import { SeedBanner, ViewHeader, Notice } from "./catalogUI";

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESC_MIN = 70;
const DESC_MAX = 160;

interface SeoState {
  seoTitle: string;
  seoDescription: string;
  slug: string;
}

export function SeoEditor({
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
  const [selId, setSelId] = useState<CatProduct["id"] | null>(null);
  const [q, setQ] = useState("");

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

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const scored = products.map((p) => ({ p, issues: seoIssues(p) }));
    const list = s
      ? scored.filter((r) => String(r.p.name ?? "").toLowerCase().includes(s))
      : scored;
    // Products with the most SEO problems float to the top.
    return list.sort((a, b) => b.issues.length - a.issues.length);
  }, [products, q]);

  const selected = products.find((p) => p.id === selId) ?? null;
  const needFix = products.filter((p) => seoIssues(p).length > 0).length;

  function save(p: CatProduct, s: SeoState) {
    const changes: ProductEdit = {};
    if (s.seoTitle !== (p.seoTitle ?? "")) changes.seoTitle = s.seoTitle;
    if (s.seoDescription !== (p.seoDescription ?? "")) changes.seoDescription = s.seoDescription;
    if (s.slug !== (p.slug ?? "")) changes.slug = s.slug;
    if (Object.keys(changes).length === 0) {
      setNotice("Nothing changed.");
      setTimeout(() => setNotice(null), 1500);
      return;
    }
    enqueueEdit(p.id, changes, p.name);
    setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...changes } : x)));
    setNotice(`SEO for ${p.name} queued — ${vpsUp ? "pushing…" : "will auto-push"}`);
    setTimeout(() => setNotice(null), 2500);
  }

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="SEO & meta editor"
        subtitle="Edit SEO titles, meta descriptions and slugs with a live search preview. Products with weak meta are listed first."
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

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader className="gap-2">
            <CardTitle>
              Catalog{" "}
              <span className="font-normal text-muted-foreground">
                · {needFix} need attention
              </span>
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter…"
                className="pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[32rem] overflow-y-auto pt-0">
            {filtered.map(({ p, issues }) => (
              <button
                key={String(p.id)}
                onClick={() => setSelId(p.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                  selId === p.id ? "bg-accent" : "hover:bg-accent/50"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {issues.length > 0 ? (
                  <Badge variant="warn">{issues.length}</Badge>
                ) : (
                  <Check className="h-3.5 w-3.5 text-ok" />
                )}
              </button>
            ))}
          </CardContent>
        </Card>

        {selected ? (
          <SeoForm key={String(selected.id)} product={selected} onSave={save} />
        ) : (
          <Empty
            icon={<Wand2 className="h-8 w-8" />}
            title="Pick a product"
            hint="Select a product to edit its search metadata."
          />
        )}
      </div>
    </div>
  );
}

function SeoForm({
  product,
  onSave,
}: {
  product: CatProduct;
  onSave: (p: CatProduct, s: SeoState) => void;
}) {
  const [title, setTitle] = useState(product.seoTitle ?? "");
  const [desc, setDesc] = useState(product.seoDescription ?? "");
  const [slug, setSlug] = useState(product.slug ?? "");

  const suggestedTitle = `${product.name}${product.brand ? " | " + product.brand : ""}`;
  const suggestedDesc =
    (product.description && product.description.length >= DESC_MIN
      ? product.description
      : `Buy ${product.name}${product.category ? " — " + product.category : ""} from DSM. Licensing, pricing and expert support.`
    ).slice(0, DESC_MAX);
  const suggestedSlug = String(product.name ?? product.id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{product.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* SERP preview */}
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="text-[11px] text-muted-foreground">
            dsm.example › products › {slug || suggestedSlug}
          </div>
          <div className="truncate text-[15px] text-[hsl(212,80%,64%)]">
            {title || suggestedTitle}
          </div>
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {desc || suggestedDesc}
          </div>
        </div>

        <SeoField
          label="SEO title"
          value={title}
          onChange={setTitle}
          min={TITLE_MIN}
          max={TITLE_MAX}
          suggestion={suggestedTitle}
          onUse={() => setTitle(suggestedTitle.slice(0, TITLE_MAX))}
        />
        <SeoField
          label="Meta description"
          value={desc}
          onChange={setDesc}
          min={DESC_MIN}
          max={DESC_MAX}
          textarea
          suggestion={suggestedDesc}
          onUse={() => setDesc(suggestedDesc)}
        />
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">URL slug</span>
            <button
              className="text-[11px] text-primary hover:underline"
              onClick={() => setSlug(suggestedSlug)}
            >
              Use “{suggestedSlug}”
            </button>
          </div>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="font-mono" />
        </div>

        <div className="flex justify-end">
          <Button onClick={() => onSave(product, { seoTitle: title, seoDescription: desc, slug })}>
            <Check className="h-4 w-4" /> Queue SEO update
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SeoField({
  label,
  value,
  onChange,
  min,
  max,
  textarea,
  suggestion,
  onUse,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  textarea?: boolean;
  suggestion: string;
  onUse: () => void;
}) {
  const len = value.length;
  const tone =
    len === 0 ? "text-muted-foreground" : len < min || len > max ? "text-warn" : "text-ok";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] tabular-nums ${tone}`}>
            {len}/{max}
          </span>
          {value !== suggestion && (
            <button className="text-[11px] text-primary hover:underline" onClick={onUse}>
              Suggest
            </button>
          )}
        </div>
      </div>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${len < min || len > max ? "bg-warn" : "bg-ok"}`}
          style={{ width: `${Math.min(100, (len / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Which SEO fields are missing / out of the recommended length band. */
function seoIssues(p: CatProduct): string[] {
  const out: string[] = [];
  const t = (p.seoTitle ?? "").length;
  const d = (p.seoDescription ?? "").length;
  if (t === 0) out.push("no title");
  else if (t < TITLE_MIN || t > TITLE_MAX) out.push("title length");
  if (d === 0) out.push("no description");
  else if (d < DESC_MIN || d > DESC_MAX) out.push("description length");
  if (!(p.slug ?? "").trim()) out.push("no slug");
  return out;
}
