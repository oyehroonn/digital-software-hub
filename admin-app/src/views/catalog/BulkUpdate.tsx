/**
 * BULK price / stock update + spreadsheet import.
 *
 * Two workflows, both funnelling through the offline queue:
 *   1. Rule-based bulk edit — select products (all / by category / low stock)
 *      and apply a price transform (set, +%, −%, round to .99) and/or a stock
 *      set/adjust in one shot.
 *   2. Import — drop a CSV/TSV/XLSX (or paste rows), match by id or SKU, preview
 *      exactly what changes, then queue every diff.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, RefreshCw, Upload, WifiOff, Wand2 } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { ProductEdit } from "@/lib/products";
import { enqueueEdit } from "@/lib/offlineQueue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney } from "@/lib/utils";
import { loadCatalog, priceNumber, stockNumber, type CatProduct } from "./catalogData";
import { parsePastedText, parseSpreadsheet } from "./xlsx";
import { SeedBanner, ViewHeader, Notice } from "./catalogUI";

type Tab = "rules" | "import";

export function BulkUpdate({
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
  const [tab, setTab] = useState<Tab>("rules");
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

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  }

  function applyEdits(edits: { p: CatProduct; changes: ProductEdit }[]) {
    for (const { p, changes } of edits) enqueueEdit(p.id, changes, p.name);
    setProducts((ps) =>
      ps.map((x) => {
        const hit = edits.find((e) => e.p.id === x.id);
        return hit ? { ...x, ...hit.changes } : x;
      }),
    );
    flash(
      `${edits.length} edit${edits.length === 1 ? "" : "s"} queued — ${
        vpsUp ? "pushing to VPS…" : "VPS offline, will auto-push"
      }`,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Bulk update & import"
        subtitle="Reprice or restock in bulk, or import a price/stock sheet. Everything is queued and pushed when the VPS is up."
        right={
          <>
            {!vpsUp && (
              <Badge variant="warn" className="gap-1">
                <WifiOff className="h-3 w-3" /> VPS offline
              </Badge>
            )}
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

      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 text-sm w-fit">
        <TabBtn active={tab === "rules"} onClick={() => setTab("rules")}>
          <Wand2 className="h-3.5 w-3.5" /> Rule-based
        </TabBtn>
        <TabBtn active={tab === "import"} onClick={() => setTab("import")}>
          <FileSpreadsheet className="h-3.5 w-3.5" /> Spreadsheet import
        </TabBtn>
      </div>

      {tab === "rules" ? (
        <RuleEditor products={products} onApply={applyEdits} />
      ) : (
        <ImportEditor products={products} onApply={applyEdits} />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Rule-based bulk editor
 * ------------------------------------------------------------------ */

type PriceOp = "none" | "set" | "incPct" | "decPct" | "round99";
type StockOp = "none" | "set" | "inc" | "dec";

function RuleEditor({
  products,
  onApply,
}: {
  products: CatProduct[];
  onApply: (edits: { p: CatProduct; changes: ProductEdit }[]) => void;
}) {
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean) as string[]))],
    [products],
  );
  const [scope, setScope] = useState("All");
  const [lowOnly, setLowOnly] = useState(false);
  const [priceOp, setPriceOp] = useState<PriceOp>("none");
  const [priceVal, setPriceVal] = useState("");
  const [stockOp, setStockOp] = useState<StockOp>("none");
  const [stockVal, setStockVal] = useState("");

  const targets = useMemo(() => {
    return products.filter((p) => {
      if (scope !== "All" && p.category !== scope) return false;
      if (lowOnly) {
        const s = stockNumber(p);
        if (s == null || s > 5) return false;
      }
      return true;
    });
  }, [products, scope, lowOnly]);

  const edits = useMemo(() => {
    const v = parseFloat(priceVal);
    const sv = parseFloat(stockVal);
    const out: { p: CatProduct; changes: ProductEdit }[] = [];
    for (const p of targets) {
      const changes: ProductEdit = {};
      const cur = priceNumber(p);
      if (priceOp !== "none" && cur != null) {
        let np = cur;
        if (priceOp === "set" && Number.isFinite(v)) np = v;
        else if (priceOp === "incPct" && Number.isFinite(v)) np = cur * (1 + v / 100);
        else if (priceOp === "decPct" && Number.isFinite(v)) np = cur * (1 - v / 100);
        else if (priceOp === "round99") np = Math.max(0, Math.floor(cur) + 0.99);
        np = Math.round(np * 100) / 100;
        if (np !== cur) changes.price = np;
      }
      if (stockOp !== "none" && Number.isFinite(sv)) {
        const curS = stockNumber(p) ?? 0;
        let ns = curS;
        if (stockOp === "set") ns = sv;
        else if (stockOp === "inc") ns = curS + sv;
        else if (stockOp === "dec") ns = Math.max(0, curS - sv);
        if (ns !== curS) changes.stock = ns;
      }
      if (Object.keys(changes).length) out.push({ p, changes });
    }
    return out;
  }, [targets, priceOp, priceVal, stockOp, stockVal]);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Rule</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Labeled label="Scope (category)">
            <Select value={scope} onChange={setScope} options={categories} />
          </Labeled>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            Only low stock (≤5)
          </label>

          <div className="mt-1 border-t border-border pt-3">
            <Labeled label="Price change">
              <Select
                value={priceOp}
                onChange={(v) => setPriceOp(v as PriceOp)}
                options={[
                  { v: "none", l: "No change" },
                  { v: "set", l: "Set to…" },
                  { v: "incPct", l: "Increase by %…" },
                  { v: "decPct", l: "Decrease by %…" },
                  { v: "round99", l: "Round to .99" },
                ]}
              />
            </Labeled>
            {priceOp !== "none" && priceOp !== "round99" && (
              <Input
                value={priceVal}
                onChange={(e) => setPriceVal(e.target.value)}
                placeholder={priceOp === "set" ? "New price" : "Percent"}
                className="mt-2"
                type="number"
              />
            )}
          </div>

          <div className="border-t border-border pt-3">
            <Labeled label="Stock change">
              <Select
                value={stockOp}
                onChange={(v) => setStockOp(v as StockOp)}
                options={[
                  { v: "none", l: "No change" },
                  { v: "set", l: "Set to…" },
                  { v: "inc", l: "Add…" },
                  { v: "dec", l: "Subtract…" },
                ]}
              />
            </Labeled>
            {stockOp !== "none" && (
              <Input
                value={stockVal}
                onChange={(e) => setStockVal(e.target.value)}
                placeholder="Quantity"
                className="mt-2"
                type="number"
              />
            )}
          </div>

          <Button
            className="mt-2"
            disabled={edits.length === 0}
            onClick={() => onApply(edits)}
          >
            Queue {edits.length} change{edits.length === 1 ? "" : "s"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {targets.length} product{targets.length === 1 ? "" : "s"} in scope ·{" "}
            {edits.length} would change.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {edits.length === 0 ? (
            <Empty title="No changes yet" hint="Pick a scope and a price/stock rule to preview." />
          ) : (
            <div className="rounded-lg border border-border">
              <Table>
                <THead>
                  <TR>
                    <TH>Product</TH>
                    <TH className="text-right">Price</TH>
                    <TH className="text-right">Stock</TH>
                  </TR>
                </THead>
                <TBody>
                  {edits.slice(0, 200).map(({ p, changes }) => (
                    <TR key={String(p.id)}>
                      <TD className="max-w-xs">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">#{String(p.id)}</div>
                      </TD>
                      <TD className="text-right tabular-nums">
                        {changes.price != null ? (
                          <Delta from={priceNumber(p)} to={Number(changes.price)} money />
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {changes.stock != null ? (
                          <Delta from={stockNumber(p)} to={Number(changes.stock)} />
                        ) : (
                          "—"
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Spreadsheet import
 * ------------------------------------------------------------------ */

interface ImportRow {
  key: string; // id or sku from the sheet
  price?: string;
  stock?: string;
  status?: string;
  name?: string;
}

function ImportEditor({
  products,
  onApply,
}: {
  products: CatProduct[];
  onApply: (edits: { p: CatProduct; changes: ProductEdit }[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState<string[][] | null>(null);
  const [paste, setPaste] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});

  const byKey = useMemo(() => {
    const m = new Map<string, CatProduct>();
    for (const p of products) {
      m.set(String(p.id).toLowerCase(), p);
      if (p.sku) m.set(String(p.sku).toLowerCase(), p);
    }
    return m;
  }, [products]);

  function ingest(rows: string[][]) {
    setErr(null);
    if (rows.length < 2) {
      setErr("Need a header row plus at least one data row.");
      return;
    }
    setRaw(rows);
    // Auto-map header names.
    const header = rows[0].map((h) => h.toLowerCase().trim());
    const find = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
    setMap({
      key: find("sku", "id"),
      price: find("price", "cost"),
      stock: find("stock", "qty", "quantity", "inventory"),
      status: find("status", "state"),
      name: find("name", "title"),
    });
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const sheet = await parseSpreadsheet(f);
      ingest(sheet.rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const parsed: ImportRow[] = useMemo(() => {
    if (!raw) return [];
    const col = (name: keyof typeof map, r: string[]) => {
      const i = map[name];
      return i != null && i >= 0 ? (r[i] ?? "").trim() : "";
    };
    return raw.slice(1).map((r) => ({
      key: col("key", r),
      price: col("price", r) || undefined,
      stock: col("stock", r) || undefined,
      status: col("status", r) || undefined,
      name: col("name", r) || undefined,
    }));
  }, [raw, map]);

  const matched = useMemo(() => {
    const out: {
      row: ImportRow;
      p: CatProduct | undefined;
      changes: ProductEdit;
    }[] = [];
    for (const row of parsed) {
      if (!row.key) continue;
      const p = byKey.get(row.key.toLowerCase());
      const changes: ProductEdit = {};
      if (p) {
        if (row.price && String(priceNumber(p) ?? "") !== String(parseFloat(row.price)))
          changes.price = parseFloat(row.price);
        if (row.stock != null && String(stockNumber(p) ?? "") !== String(parseInt(row.stock, 10)))
          changes.stock = parseInt(row.stock, 10);
        if (row.status && row.status !== p.status) changes.status = row.status;
        if (row.name && row.name !== p.name) changes.name = row.name;
      }
      out.push({ row, p, changes });
    }
    return out;
  }, [parsed, byKey]);

  const applicable = matched.filter((m) => m.p && Object.keys(m.changes).length > 0);
  const unmatched = matched.filter((m) => !m.p).length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Import a price / stock sheet</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.xlsx"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Choose CSV / TSV / XLSX
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Header row must include an <b>id</b> or <b>sku</b> column. Optional: price, stock,
              status, name.
            </span>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">…or paste rows (CSV/TSV)</summary>
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={5}
                placeholder={"sku,price,stock\nDSM-DSM-101,1399,60"}
                className="w-full rounded-md border border-input bg-background px-2 py-1 font-mono text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => paste.trim() && ingest(parsePastedText(paste))}
              >
                Parse pasted rows
              </Button>
            </div>
          </details>

          {err && <div className="text-xs text-down">{err}</div>}
        </CardContent>
      </Card>

      {raw && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>
              Preview — {applicable.length} change{applicable.length === 1 ? "" : "s"},{" "}
              {unmatched} unmatched
            </CardTitle>
            <Button
              size="sm"
              disabled={applicable.length === 0}
              onClick={() => onApply(applicable.map((m) => ({ p: m.p!, changes: m.changes })))}
            >
              Queue {applicable.length} change{applicable.length === 1 ? "" : "s"}
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              {(["key", "price", "stock", "status", "name"] as const).map((f) => (
                <span key={f}>
                  {f}:{" "}
                  <Badge variant={map[f] >= 0 ? "ok" : "muted"}>
                    {map[f] >= 0 ? raw[0][map[f]] : "not mapped"}
                  </Badge>
                </span>
              ))}
            </div>
            <div className="rounded-lg border border-border">
              <Table>
                <THead>
                  <TR>
                    <TH>Key</TH>
                    <TH>Matched product</TH>
                    <TH className="text-right">Price</TH>
                    <TH className="text-right">Stock</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {matched.slice(0, 300).map((m, i) => (
                    <TR key={i}>
                      <TD className="font-mono text-xs">{m.row.key}</TD>
                      <TD className="max-w-xs">
                        {m.p ? (
                          <span className="truncate">{m.p.name}</span>
                        ) : (
                          <Badge variant="down">no match</Badge>
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {m.changes.price != null && m.p ? (
                          <Delta from={priceNumber(m.p)} to={Number(m.changes.price)} money />
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {m.changes.stock != null && m.p ? (
                          <Delta from={stockNumber(m.p)} to={Number(m.changes.stock)} />
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD>
                        {m.changes.status ? (
                          <Badge variant="warn">{m.changes.status}</Badge>
                        ) : (
                          "—"
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Delta({ from, to, money }: { from: number | null; to: number; money?: boolean }) {
  const f = (n: number) => (money ? fmtMoney(n) : n.toLocaleString());
  const up = from == null || to >= from;
  return (
    <span>
      {from != null && (
        <span className="text-[11px] text-muted-foreground line-through">{f(from)}</span>
      )}{" "}
      <span className={up ? "text-ok" : "text-down"}>{f(to)}</span>
    </span>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: (string | { v: string; l: string })[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
    >
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.v;
        const l = typeof o === "string" ? o : o.l;
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}
