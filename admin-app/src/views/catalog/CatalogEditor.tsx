/**
 * Inline product EDITOR — edit name, price, sale price, stock, status and
 * description directly in the table. Every change is optimistic locally and
 * pushed through the offline queue (auto-syncs to the VPS when it's up), so an
 * admin can keep working with the box offline.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Check, Pencil, RefreshCw, Search, WifiOff, X } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { ProductEdit } from "@/lib/products";
import { enqueueEdit, enqueueRegen } from "@/lib/offlineQueue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { fmtMoney } from "@/lib/utils";
import { loadCatalog, type CatProduct } from "./catalogData";
import { SeedBanner, ViewHeader, Notice } from "./catalogUI";

export function CatalogEditor({
  config,
  vpsUp,
  products: productsProp,
  seeded: seededProp,
  onLocalEdit,
}: {
  config: AppConfig;
  vpsUp: boolean;
  products?: CatProduct[];
  seeded?: boolean;
  onLocalEdit?: (id: CatProduct["id"], changes: ProductEdit) => void;
}) {
  const selfLoad = productsProp === undefined;
  const [products, setProducts] = useState<CatProduct[]>(productsProp ?? []);
  const [seeded, setSeeded] = useState(!!seededProp);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<CatProduct["id"] | null>(null);

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
    setTimeout(() => setNotice(null), 2500);
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter(
      (p) =>
        String(p.name ?? "").toLowerCase().includes(s) ||
        String(p.sku ?? "").toLowerCase().includes(s) ||
        String(p.id).toLowerCase().includes(s),
    );
  }, [products, q]);

  function commit(p: CatProduct, changes: ProductEdit) {
    if (Object.keys(changes).length === 0) {
      setEditingId(null);
      return;
    }
    setProducts((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...changes } : x)));
    enqueueEdit(p.id, changes, p.name);
    onLocalEdit?.(p.id, changes);
    setEditingId(null);
    flash(vpsUp ? "Edit queued — pushing to VPS…" : "VPS offline — edit queued, will auto-push");
  }

  function regen(p: CatProduct) {
    enqueueRegen(p.id, p.name);
    flash(vpsUp ? "Box regen queued — pushing…" : "VPS offline — regen queued, will auto-push");
  }

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Product editor"
        subtitle="Edit price, stock, name and description inline. Changes queue offline and auto-push when the VPS is back."
        right={
          <>
            {!vpsUp && (
              <Badge variant="warn" className="gap-1">
                <WifiOff className="h-3 w-3" /> VPS offline
              </Badge>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name / SKU / id…"
                className="w-56 pl-8"
              />
            </div>
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

      {filtered.length === 0 && !loading ? (
        <Empty icon={<Boxes className="h-8 w-8" />} title="No products found" />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>Category</TH>
                <TH className="text-right">Price</TH>
                <TH className="text-right">Stock</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((p) =>
                editingId === p.id ? (
                  <EditRow
                    key={String(p.id)}
                    product={p}
                    onCancel={() => setEditingId(null)}
                    onSave={(c) => commit(p, c)}
                  />
                ) : (
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
                      {p.salePrice != null && p.salePrice !== "" ? (
                        <span>
                          <span className="text-ok">{fmtMoney(p.salePrice)}</span>{" "}
                          <span className="text-[11px] text-muted-foreground line-through">
                            {p.price != null ? fmtMoney(p.price) : ""}
                          </span>
                        </span>
                      ) : p.price != null && p.price !== "" ? (
                        fmtMoney(p.price)
                      ) : (
                        <Badge variant="warn">Contact</Badge>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">
                      <StockCell p={p} />
                    </TD>
                    <TD>
                      <Badge variant={p.status === "active" ? "ok" : "muted"}>
                        {p.status ?? "unknown"}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(p.id)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => regen(p)}>
                          <Boxes className="h-3.5 w-3.5" /> Regen box
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ),
              )}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function StockCell({ p }: { p: CatProduct }) {
  const n = typeof p.stock === "number" ? p.stock : Number(p.stock);
  if (p.stock == null || Number.isNaN(n)) return <span className="text-muted-foreground">—</span>;
  const tone = n === 0 ? "text-down" : n <= 5 ? "text-warn" : "";
  return <span className={tone}>{n.toLocaleString()}</span>;
}

function EditRow({
  product,
  onCancel,
  onSave,
}: {
  product: CatProduct;
  onCancel: () => void;
  onSave: (c: ProductEdit) => void;
}) {
  const [name, setName] = useState(String(product.name ?? ""));
  const [price, setPrice] = useState(String(product.price ?? ""));
  const [sale, setSale] = useState(String(product.salePrice ?? ""));
  const [stock, setStock] = useState(String(product.stock ?? ""));
  const [status, setStatus] = useState(product.status ?? "active");
  const [desc, setDesc] = useState(String(product.description ?? ""));

  function save() {
    const c: ProductEdit = {};
    if (name !== String(product.name ?? "")) c.name = name;
    if (price !== String(product.price ?? "")) c.price = price;
    if (sale !== String(product.salePrice ?? "")) c.salePrice = sale;
    if (stock !== String(product.stock ?? "")) c.stock = Number(stock);
    if (status !== product.status) c.status = status;
    if (desc !== String(product.description ?? "")) c.description = desc;
    onSave(c);
  }

  return (
    <TR className="bg-accent/40 align-top">
      <TD className="max-w-sm py-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="mb-2 h-8" />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={2}
          placeholder="Description…"
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
        />
      </TD>
      <TD>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="active">active</option>
          <option value="draft">draft</option>
          <option value="archived">archived</option>
          <option value="out_of_stock">out_of_stock</option>
        </select>
      </TD>
      <TD className="py-3 text-right">
        <Input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price"
          className="mb-1 h-8 text-right"
        />
        <Input
          value={sale}
          onChange={(e) => setSale(e.target.value)}
          placeholder="Sale price"
          className="h-8 text-right"
        />
      </TD>
      <TD className="py-3 text-right">
        <Input
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          type="number"
          className="h-8 text-right"
        />
      </TD>
      <TD />
      <TD className="py-3 text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" onClick={save}>
            <Check className="h-3.5 w-3.5" /> Save
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TD>
    </TR>
  );
}
