/**
 * AI BULK DESCRIPTION / SEO GENERATOR.
 *
 * Loads the catalog from the VPS product API (UNSTABLE — falls back to a list
 * derived from the Orders sheet + DSM's own featured products when it's down),
 * lets the admin multi-select products, and generates SEO title / meta / rich
 * description / keywords / slug for each via the LLM, one at a time with live
 * per-row progress. Generated copy can be queued back to the VPS through the
 * offline edit queue (auto-pushes when the VPS returns).
 *
 * Resilience: catalog loads with no LLM. Generation is per-row and isolated —
 * one row failing (or the model going down mid-run) never breaks the others.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Package,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { getProducts, type Product } from "@/lib/products";
import { fetchOrders } from "@/lib/ecommerce";
import { enqueueEdit } from "@/lib/offlineQueue";
import { chatJson } from "@/lib/llm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/Empty";
import { cn } from "@/lib/utils";
import { AiUnavailable, CopyButton, LlmBadge, useLlmHealth } from "./aiKit";

interface SeoResult {
  seoTitle: string;
  metaDescription: string;
  description: string;
  keywords: string[];
  slug: string;
}
type RowState = "idle" | "thinking" | "done" | "error";
interface Row {
  id: string;
  name: string;
  category?: string;
  state: RowState;
  result?: SeoResult;
  error?: string;
  queued?: boolean;
}

// DSM's own products to seed the list when the VPS catalog is unreachable.
const FEATURED: { id: string; name: string; category: string }[] = [
  { id: "dsm", name: "DSM", category: "Platform" },
  { id: "virtual-sizing", name: "Virtual Sizing", category: "Retail AI" },
  { id: "virtual-try-on", name: "Virtual Try-On", category: "Retail AI" },
  { id: "pointblank", name: "Pointblank", category: "3D Tech" },
  { id: "preservemy-world", name: "PreserveMy.World", category: "Archival" },
  { id: "vpo", name: "VPO", category: "Operations" },
  { id: "techrealm", name: "TechRealm", category: "Platform" },
  { id: "logicpacks", name: "LogicPacks", category: "Developer" },
  { id: "lazyware", name: "Lazyware", category: "Automation" },
  { id: "bringit", name: "Bringit", category: "Logistics" },
  { id: "flyaquab", name: "FlyAquab", category: "Consumer" },
  { id: "apex", name: "Apex", category: "Platform" },
  { id: "ummah-directory", name: "Ummah Directory", category: "Community" },
];

export function BulkSeoGenerator({ config }: { config: AppConfig }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState<"vps" | "orders" | "featured">("featured");
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const cancelRef = useRef(false);

  const { status: llm, recheck } = useLlmHealth(config);

  const load = useCallback(async () => {
    setLoading(true);
    let list: { id: string; name: string; category?: string }[] = [];
    let src: typeof source = "featured";
    try {
      const res = await getProducts(config, { limit: 200 });
      if (res.products.length) {
        list = res.products.map((p: Product) => ({
          id: String(p.id),
          name: p.name || String(p.id),
          category: p.category,
        }));
        src = "vps";
      }
    } catch {
      /* VPS down — fall back */
    }
    if (list.length === 0) {
      try {
        const orders = await fetchOrders(config);
        const seen = new Map<string, string>();
        for (const o of orders) {
          const id = String(o.productId ?? o.sku ?? o.productName ?? "").trim();
          if (id && !seen.has(id)) seen.set(id, String(o.productName ?? id));
        }
        if (seen.size) {
          list = [...seen.entries()].map(([id, name]) => ({ id, name }));
          src = "orders";
        }
      } catch {
        /* orders unreachable too */
      }
    }
    if (list.length === 0) {
      list = FEATURED;
      src = "featured";
    }
    setSource(src);
    setRows(list.map((p) => ({ id: p.id, name: p.name, category: p.category, state: "idle" })));
    setSelected(new Set());
    setLoading(false);
  }, [config]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const t = q.toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(t) || (r.category ?? "").toLowerCase().includes(t));
  }, [rows, q]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const selectAllVisible = () => setSelected(new Set(filtered.map((r) => r.id)));
  const clearSel = () => setSelected(new Set());

  const patchRow = (id: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const generateOne = useCallback(
    async (row: Row): Promise<void> => {
      patchRow(row.id, { state: "thinking", error: undefined });
      try {
        const result = await chatJson<SeoResult>(
          config,
          [
            {
              role: "system",
              content:
                "You are an ecommerce SEO copywriter for DSM, a B2B software & 3D-technology company. Given a product name and category, write conversion-focused, keyword-rich copy. Respond ONLY with JSON of shape " +
                '{"seoTitle": string, "metaDescription": string, "description": string, "keywords": string[], "slug": string}. ' +
                "seoTitle ≤ 60 chars. metaDescription ≤ 155 chars, benefit-led. description = 2-3 punchy sentences of marketing copy. keywords = 5-8 relevant search terms. slug = lowercase-hyphenated. No markdown.",
            },
            { role: "user", content: JSON.stringify({ name: row.name, category: row.category ?? "" }) },
          ],
          { temperature: 0.6, maxTokens: 700 },
        );
        patchRow(row.id, {
          state: "done",
          result: {
            seoTitle: String(result?.seoTitle ?? ""),
            metaDescription: String(result?.metaDescription ?? ""),
            description: String(result?.description ?? ""),
            keywords: Array.isArray(result?.keywords) ? result.keywords.map(String) : [],
            slug: String(result?.slug ?? ""),
          },
        });
        setExpanded((s) => new Set(s).add(row.id));
      } catch (e) {
        patchRow(row.id, { state: "error", error: e instanceof Error ? e.message : String(e) });
      }
    },
    [config],
  );

  const runBulk = useCallback(async () => {
    const targets = rows.filter((r) => selected.has(r.id));
    if (!targets.length) return;
    setRunning(true);
    cancelRef.current = false;
    for (const row of targets) {
      if (cancelRef.current) break;
      // Read the freshest row (state may have changed).
      await generateOne(row);
    }
    setRunning(false);
  }, [rows, selected, generateOne]);

  const stopBulk = () => {
    cancelRef.current = true;
  };

  const queueRow = (row: Row) => {
    if (!row.result) return;
    enqueueEdit(row.id, { name: row.result.seoTitle, description: row.result.description }, row.name);
    patchRow(row.id, { queued: true });
  };

  const doneCount = rows.filter((r) => r.state === "done").length;
  const selCount = selected.size;
  const allDown = llm === "down";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">AI Bulk SEO Generator</h1>
            <LlmBadge status={llm} />
          </div>
          <p className="text-xs text-muted-foreground">
            Generate SEO titles, meta descriptions & keywords for many products at once.{" "}
            <Badge variant="muted">
              source: {source === "vps" ? "live catalog" : source === "orders" ? "orders sheet" : "DSM featured"}
            </Badge>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Reload catalog
          </Button>
          {running ? (
            <Button variant="destructive" size="sm" onClick={stopBulk}>
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={runBulk} disabled={selCount === 0 || allDown} title={allDown ? "AI offline" : ""}>
              <Wand2 /> Generate {selCount ? `(${selCount})` : ""}
            </Button>
          )}
        </div>
      </div>

      {allDown && rows.length > 0 && (
        <AiUnavailable
          detail="model offline"
          onRetry={async () => {
            await recheck();
          }}
        />
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Package className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter products…"
                className="w-56 pl-8"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {selCount} selected · {doneCount}/{rows.length} generated
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={selectAllVisible} className="text-xs text-primary hover:underline">
              Select all
            </button>
            <button onClick={clearSel} className="text-xs text-muted-foreground hover:underline">
              Clear
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && rows.length === 0 ? (
            <div className="p-4">
              <Empty title="Loading catalog…" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <Empty icon={<Package className="h-8 w-8" />} title="No products" />
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {filtered.map((row) => (
                <li key={row.id}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5",
                      selected.has(row.id) && "bg-accent/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    <button
                      onClick={() =>
                        setExpanded((s) => {
                          const n = new Set(s);
                          n.has(row.id) ? n.delete(row.id) : n.add(row.id);
                          return n;
                        })
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      disabled={row.state !== "done" && row.state !== "error"}
                    >
                      {row.state === "done" || row.state === "error" ? (
                        expanded.has(row.id) ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )
                      ) : (
                        <span className="h-4 w-4 shrink-0" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{row.name}</span>
                        {row.category && (
                          <span className="block truncate text-[11px] text-muted-foreground">{row.category}</span>
                        )}
                      </span>
                    </button>

                    <RowStatus row={row} />

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generateOne(row)}
                        disabled={row.state === "thinking" || allDown}
                      >
                        <Sparkles className={row.state === "thinking" ? "animate-pulse" : ""} />
                      </Button>
                    </div>
                  </div>

                  {expanded.has(row.id) && (row.state === "done" || row.state === "error") && (
                    <div className="border-t border-border/40 bg-muted/20 px-4 py-3">
                      {row.state === "error" ? (
                        <p className="text-xs text-down">Generation failed: {row.error}</p>
                      ) : row.result ? (
                        <div className="flex flex-col gap-2 text-sm">
                          <Field label="SEO title" value={row.result.seoTitle} hint={`${row.result.seoTitle.length} chars`} />
                          <Field
                            label="Meta description"
                            value={row.result.metaDescription}
                            hint={`${row.result.metaDescription.length} chars`}
                          />
                          <Field label="Description" value={row.result.description} />
                          <Field label="Slug" value={row.result.slug} mono />
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Keywords</div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {row.result.keywords.map((k, i) => (
                                <Badge key={i} variant="muted">
                                  {k}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <CopyButton
                              text={`Title: ${row.result.seoTitle}\nMeta: ${row.result.metaDescription}\nDescription: ${row.result.description}\nSlug: ${row.result.slug}\nKeywords: ${row.result.keywords.join(", ")}`}
                              label="Copy all"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => queueRow(row)}
                              disabled={row.queued}
                            >
                              <ClipboardCheck className={row.queued ? "text-ok" : ""} />{" "}
                              {row.queued ? "Queued" : "Queue edit"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Queued edits are stored offline and auto-push to the VPS when it&apos;s reachable — nothing is lost if the
        product API is down.
      </p>
    </div>
  );
}

function RowStatus({ row }: { row: Row }) {
  if (row.state === "thinking")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-primary">
        <Sparkles className="h-3.5 w-3.5 animate-pulse" /> writing…
      </span>
    );
  if (row.state === "done")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ok">
        <CheckCircle2 className="h-3.5 w-3.5" /> done
      </span>
    );
  if (row.state === "error") return <span className="text-xs text-down">failed</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

function Field({ label, value, hint, mono }: { label: string; value: string; hint?: string; mono?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      <p className={cn("text-foreground/90", mono && "font-mono text-xs")}>{value}</p>
    </div>
  );
}
