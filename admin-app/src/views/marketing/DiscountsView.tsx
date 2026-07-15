/**
 * Discount / coupon / member-pricing manager. Codes live in the local marketing
 * store; redemption caps and validity windows are enforced visually (active,
 * expiring, exhausted). Member-pricing rows set an absolute price for a tier.
 */
import { useMemo, useState } from "react";
import { Ticket, Plus, Pencil, Trash2, Power, Copy, Percent, BadgeDollarSign, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { fmtMoney } from "@/lib/utils";
import { upsertCoupon, deleteCoupon, uid, type Coupon, type CouponType } from "./store";
import { useMarketing } from "./useStore";
import { Modal, Field, Select, StatTile, ViewHeader, Meter, Notice, SeedBadge } from "./ui";

function couponValueLabel(c: Coupon): string {
  if (c.type === "percent") return `${c.value}% off`;
  if (c.type === "fixed") return `${fmtMoney(c.value)} off`;
  return `${fmtMoney(c.value)} member price`;
}

function couponState(c: Coupon): { label: string; tone: "ok" | "warn" | "muted" | "down" } {
  if (!c.active) return { label: "inactive", tone: "muted" };
  if (c.maxRedemptions && c.redemptions >= c.maxRedemptions) return { label: "exhausted", tone: "down" };
  if (c.endDate) {
    const days = (Date.parse(c.endDate) - Date.now()) / 86400000;
    if (days < 0) return { label: "expired", tone: "muted" };
    if (days <= 3) return { label: "expiring", tone: "warn" };
  }
  return { label: "active", tone: "ok" };
}

export function DiscountsView() {
  const { coupons } = useMarketing();
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function flash(m: string) { setNotice(m); setTimeout(() => setNotice(null), 2500); }

  const stats = useMemo(() => {
    const activeCount = coupons.filter((c) => couponState(c).label === "active" || couponState(c).label === "expiring").length;
    const redemptions = coupons.reduce((s, c) => s + c.redemptions, 0);
    const memberPricing = coupons.filter((c) => c.type === "member_price").length;
    return { activeCount, redemptions, memberPricing };
  }, [coupons]);

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Discounts & member pricing"
        subtitle="Coupons, fixed/percent discounts and per-tier member pricing."
        actions={<Button size="sm" onClick={() => setEditing(blankCoupon())}><Plus /> New code</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<Ticket className="h-4 w-4" />} label="Codes" value={String(coupons.length)} sub={`${stats.activeCount} live`} />
        <StatTile icon={<BadgeDollarSign className="h-4 w-4" />} label="Redemptions" value={stats.redemptions.toLocaleString()} />
        <StatTile icon={<Crown className="h-4 w-4" />} label="Member-price rules" value={String(stats.memberPricing)} />
        <StatTile icon={<Percent className="h-4 w-4" />} label="Percent codes" value={String(coupons.filter((c) => c.type === "percent").length)} />
      </div>

      {coupons.length === 0 ? (
        <Empty icon={<Ticket className="h-8 w-8" />} title="No codes yet" hint="Create a coupon, discount or member-pricing rule." />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Type</TH>
                <TH>Value</TH>
                <TH>Applies to</TH>
                <TH className="w-40">Redemptions</TH>
                <TH>Window</TH>
                <TH>State</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {coupons.map((c) => {
                const st = couponState(c);
                const cap = c.maxRedemptions || 0;
                return (
                  <TR key={c.id}>
                    <TD>
                      <div className="flex items-center gap-1 font-mono font-medium">
                        {c.code}
                        <button className="text-muted-foreground hover:text-foreground" title="Copy"
                          onClick={() => { navigator.clipboard?.writeText(c.code); flash(`Copied ${c.code}`); }}>
                          <Copy className="h-3 w-3" />
                        </button>
                        {c._seed && <SeedBadge />}
                      </div>
                      {c.stackable && <span className="text-[10px] text-muted-foreground">stackable</span>}
                    </TD>
                    <TD className="capitalize text-muted-foreground">{c.type.replace("_", " ")}</TD>
                    <TD className="font-medium">{couponValueLabel(c)}</TD>
                    <TD className="text-muted-foreground">
                      {c.scope === "all" ? "All products" : (c.scopeName ?? `#${c.scope}`)}
                      {c.tier && <span className="ml-1 text-[11px]">· {c.tier} tier</span>}
                    </TD>
                    <TD>
                      {cap ? (
                        <div className="flex flex-col gap-1">
                          <Meter value={cap ? c.redemptions / cap : 0} tone={c.redemptions >= cap ? "down" : "primary"} />
                          <span className="text-[10px] tabular-nums text-muted-foreground">{c.redemptions}/{cap}</span>
                        </div>
                      ) : <span className="tabular-nums text-muted-foreground">{c.redemptions} · ∞</span>}
                    </TD>
                    <TD className="whitespace-nowrap text-[11px] text-muted-foreground">
                      {c.startDate || "—"} → {c.endDate || "∞"}
                    </TD>
                    <TD><Badge variant={st.tone}>{st.label}</Badge></TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title={c.active ? "Deactivate" : "Activate"}
                          onClick={() => { upsertCoupon({ ...c, active: !c.active }); flash(c.active ? "Deactivated" : "Activated"); }}>
                          <Power className={`h-3.5 w-3.5 ${c.active ? "text-ok" : "text-muted-foreground"}`} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-down"
                          onClick={() => { if (confirm(`Delete code ${c.code}?`)) { deleteCoupon(c.id); flash("Deleted"); } }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}

      {editing && (
        <CouponDialog coupon={editing} onClose={() => setEditing(null)}
          onSave={(c) => { upsertCoupon(c); setEditing(null); flash("Code saved"); }} />
      )}
      <Notice msg={notice} />
    </div>
  );
}

function blankCoupon(): Coupon {
  return { id: uid("cpn"), code: "", type: "percent", value: 10, scope: "all", redemptions: 0, stackable: false, active: true, createdAt: Date.now() };
}

function CouponDialog({ coupon, onClose, onSave }: { coupon: Coupon; onClose: () => void; onSave: (c: Coupon) => void }) {
  const [f, setF] = useState<Coupon>({ ...coupon });
  const set = <K extends keyof Coupon>(k: K, v: Coupon[K]) => setF((p) => ({ ...p, [k]: v }));
  const valueLabel = f.type === "percent" ? "Percent off (0-100)" : f.type === "fixed" ? "Amount off" : "Member price";

  return (
    <Modal
      title={coupon.code ? "Edit code" : "New code"}
      subtitle="Percent / fixed discount or an absolute member price for a tier."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!f.code.trim()} onClick={() => onSave({ ...f, code: f.code.trim().toUpperCase() })}>Save code</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code"><Input value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="INSIDER20" className="font-mono" /></Field>
        <Field label="Type">
          <Select value={f.type} onChange={(e) => set("type", e.target.value as CouponType)}>
            <option value="percent">Percent off</option>
            <option value="fixed">Fixed amount off</option>
            <option value="member_price">Member price</option>
          </Select>
        </Field>
        <Field label={valueLabel}><Input type="number" value={f.value} onChange={(e) => set("value", Number(e.target.value))} /></Field>
        {f.type === "member_price" && (
          <Field label="Member tier"><Input value={f.tier ?? ""} onChange={(e) => set("tier", e.target.value)} placeholder="Pro" /></Field>
        )}
        <Field label="Applies to (product ID)" hint='"all" or a productId.'>
          <Input value={f.scope} onChange={(e) => set("scope", e.target.value || "all")} placeholder="all" />
        </Field>
        <Field label="Product name (if scoped)"><Input value={f.scopeName ?? ""} onChange={(e) => set("scopeName", e.target.value)} placeholder="Virtual Try-On" /></Field>
        <Field label="Min quantity"><Input type="number" value={f.minQty ?? ""} onChange={(e) => set("minQty", e.target.value === "" ? undefined : Number(e.target.value))} /></Field>
        <Field label="Max redemptions" hint="0 / blank = unlimited.">
          <Input type="number" value={f.maxRedemptions ?? ""} onChange={(e) => set("maxRedemptions", e.target.value === "" ? undefined : Number(e.target.value))} />
        </Field>
        <Field label="Start date"><Input type="date" value={f.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} /></Field>
        <Field label="End date"><Input type="date" value={f.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} /></Field>
        <label className="col-span-2 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={f.stackable} onChange={(e) => set("stackable", e.target.checked)} /> Stackable with other codes
        </label>
      </div>
    </Modal>
  );
}
