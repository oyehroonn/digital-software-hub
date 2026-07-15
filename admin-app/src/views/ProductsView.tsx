import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Boxes, Pencil, RefreshCw, Search, WifiOff } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { getProducts, type Product, type ProductEdit } from "@/lib/products";
import { enqueueEdit, enqueueRegen } from "@/lib/offlineQueue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { fmtMoney } from "@/lib/utils";

export function ProductsView({ config, vpsUp }: { config: AppConfig; vpsUp: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getProducts(config, { limit: 200, q: q || undefined });
      setProducts(res.products);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [config, q]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  }

  function saveEdit(changes: ProductEdit) {
    if (!editing) return;
    // Optimistic local update.
    setProducts((ps) => ps.map((p) => (p.id === editing.id ? { ...p, ...changes } : p)));
    enqueueEdit(editing.id, changes, editing.name);
    setEditing(null);
    flash(vpsUp ? "Edit queued — pushing to VPS…" : "VPS offline — edit queued, will auto-push");
  }

  function regen(p: Product) {
    enqueueRegen(p.id, p.name);
    flash(vpsUp ? "Box regen queued — pushing…" : "VPS offline — regen queued, will auto-push");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Products</h1>
          <p className="text-xs text-muted-foreground">
            View & edit catalog, price and stock. Edits queue offline and auto-push when the VPS is up.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Search products…"
              className="w-56 pl-8"
            />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </div>

      {notice && (
        <div className="rounded-md border border-border bg-accent/50 px-3 py-2 text-xs">{notice}</div>
      )}

      {error ? (
        <Empty
          icon={<WifiOff className="h-8 w-8" />}
          title="Couldn't reach the product API"
          hint={`The VPS is an unstable backend and may be offline. You can still queue edits — they'll push when it's back. (${error})`}
        />
      ) : products.length === 0 && !loading ? (
        <Empty icon={<Boxes className="h-8 w-8" />} title="No products found" />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>Brand</TH>
                <TH>Category</TH>
                <TH className="text-right">Price</TH>
                <TH className="text-right">Stock</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {products.map((p) => (
                <TR key={String(p.id)}>
                  <TD className="max-w-xs">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">#{String(p.id)}</div>
                  </TD>
                  <TD className="text-muted-foreground">{p.brand ?? "—"}</TD>
                  <TD className="text-muted-foreground">{p.category ?? "—"}</TD>
                  <TD className="text-right tabular-nums">
                    {p.price != null ? fmtMoney(p.price) : "—"}
                  </TD>
                  <TD className="text-right tabular-nums">{p.stock ?? "—"}</TD>
                  <TD>
                    <Badge variant={p.status === "active" ? "ok" : "muted"}>
                      {p.status ?? "unknown"}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => regen(p)}>
                        <Boxes className="h-3.5 w-3.5" /> Regen box
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {editing && <EditDialog product={editing} onClose={() => setEditing(null)} onSave={saveEdit} />}
    </div>
  );
}

function EditDialog({
  product,
  onClose,
  onSave,
}: {
  product: Product;
  onClose: () => void;
  onSave: (c: ProductEdit) => void;
}) {
  const [price, setPrice] = useState(String(product.price ?? ""));
  const [stock, setStock] = useState(String(product.stock ?? ""));
  const [status, setStatus] = useState(product.status ?? "active");
  const [name, setName] = useState(product.name ?? "");

  function submit() {
    const changes: ProductEdit = {};
    if (name !== product.name) changes.name = name;
    if (price !== String(product.price ?? "")) changes.price = price;
    if (stock !== String(product.stock ?? "")) changes.stock = Number(stock);
    if (status !== product.status) changes.status = status;
    onSave(changes);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-sm font-semibold">Edit product</h2>
        <p className="mb-4 text-xs text-muted-foreground">#{String(product.id)}</p>
        <div className="flex flex-col gap-3">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price">
              <Input value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <Field label="Stock">
              <Input value={stock} onChange={(e) => setStock(e.target.value)} type="number" />
            </Field>
          </div>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="active">active</option>
              <option value="draft">draft</option>
              <option value="archived">archived</option>
              <option value="out_of_stock">out_of_stock</option>
            </select>
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit}>
            Queue edit
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
