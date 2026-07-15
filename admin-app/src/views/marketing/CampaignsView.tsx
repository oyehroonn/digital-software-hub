/**
 * Campaign manager — create / assign / track a campaign per product · channel.
 * Live performance (impressions, clicks, revenue, ROAS, goal progress) is joined
 * from the stable Telemetry + Orders sheets by UTM + product; the campaign
 * definition itself lives in the local marketing store.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Megaphone, Plus, Pencil, Trash2, RefreshCw, Target, MousePointerClick, DollarSign, TrendingUp,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchOrders, fetchTelemetry, type Order, type TelemetryEvent } from "@/lib/ecommerce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { fmtMoney } from "@/lib/utils";
import {
  CHANNELS, upsertCampaign, deleteCampaign, uid,
  type Campaign, type CampaignStatus, type Channel,
} from "./store";
import { useMarketing } from "./useStore";
import { campaignPerformance } from "./metrics";
import { Modal, Field, Select, Textarea, StatTile, ViewHeader, Meter, Notice, pct, SeedBadge } from "./ui";

const STATUS_TONE: Record<CampaignStatus, "ok" | "warn" | "muted" | "default"> = {
  active: "ok", scheduled: "default", paused: "warn", draft: "muted", ended: "muted",
};

export function CampaignsView({ config }: { config: AppConfig }) {
  const { campaigns } = useMarketing();
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function flash(m: string) { setNotice(m); setTimeout(() => setNotice(null), 2500); }

  const load = useCallback(async () => {
    setLoading(true);
    const [ev, od] = await Promise.all([
      fetchTelemetry(config).catch(() => [] as TelemetryEvent[]),
      fetchOrders(config).catch(() => [] as Order[]),
    ]);
    setEvents(ev); setOrders(od); setLoading(false);
  }, [config]);

  useEffect(() => { load(); }, [load]);

  const perf = useMemo(
    () => new Map(campaigns.map((c) => [c.id, campaignPerformance(c, events, orders)])),
    [campaigns, events, orders],
  );

  const totals = useMemo(() => {
    let spend = 0, revenue = 0, clicks = 0, conversions = 0;
    for (const c of campaigns) {
      const m = perf.get(c.id)!;
      spend += Number(c.spend ?? 0); revenue += m.revenue; clicks += m.clicks; conversions += m.conversions;
    }
    return { spend, revenue, clicks, conversions, roas: spend ? revenue / spend : 0 };
  }, [campaigns, perf]);

  const active = campaigns.filter((c) => c.status === "active").length;

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Campaigns"
        subtitle="One campaign per product · channel. Performance joins live Telemetry + Orders."
        actions={
          <>
            <Button variant="outline" size="sm" disabled={loading} onClick={load}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> {loading ? "Loading" : "Data"}
            </Button>
            <Button size="sm" onClick={() => setEditing(blankCampaign())}>
              <Plus /> New campaign
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile icon={<Megaphone className="h-4 w-4" />} label="Campaigns" value={String(campaigns.length)} sub={`${active} active`} />
        <StatTile icon={<MousePointerClick className="h-4 w-4" />} label="Attributed clicks" value={totals.clicks.toLocaleString()} />
        <StatTile icon={<TrendingUp className="h-4 w-4" />} label="Conversions" value={totals.conversions.toLocaleString()} />
        <StatTile icon={<DollarSign className="h-4 w-4" />} label="Revenue" value={fmtMoney(totals.revenue)} />
        <StatTile icon={<Target className="h-4 w-4" />} label="Blended ROAS" value={`${totals.roas.toFixed(2)}×`} sub={`Spend ${fmtMoney(totals.spend)}`} />
      </div>

      {campaigns.length === 0 ? (
        <Empty icon={<Megaphone className="h-8 w-8" />} title="No campaigns yet" hint="Create your first campaign to start tracking product · channel performance." />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Campaign</TH>
                <TH>Channel</TH>
                <TH className="text-right">Clicks</TH>
                <TH className="text-right">Conv.</TH>
                <TH className="text-right">Revenue</TH>
                <TH className="text-right">ROAS</TH>
                <TH className="w-40">Goal</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {campaigns.map((c) => {
                const m = perf.get(c.id)!;
                return (
                  <TR key={c.id}>
                    <TD className="max-w-[16rem]">
                      <div className="flex items-center truncate font-medium">
                        {c.name}{c._seed && <SeedBadge />}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.productName ?? "All products"}
                        {c.utmCampaign ? ` · utm:${c.utmCampaign}` : ""}
                        {c.couponCode ? ` · ${c.couponCode}` : ""}
                      </div>
                    </TD>
                    <TD><Badge variant="muted" className="capitalize">{c.channel}</Badge></TD>
                    <TD className="text-right tabular-nums">{m.clicks.toLocaleString()}</TD>
                    <TD className="text-right tabular-nums">{m.conversions.toLocaleString()}</TD>
                    <TD className="text-right tabular-nums">{m.revenue > 0 ? fmtMoney(m.revenue, m.currency) : "—"}</TD>
                    <TD className="text-right tabular-nums">
                      {c.spend ? <span className={m.roas >= 3 ? "text-ok" : m.roas >= 1 ? "" : "text-warn"}>{m.roas.toFixed(2)}×</span> : "—"}
                    </TD>
                    <TD>
                      {c.goalRevenue ? (
                        <div className="flex flex-col gap-1">
                          <Meter value={m.goalPct} tone={m.goalPct >= 1 ? "ok" : "primary"} />
                          <span className="text-[10px] text-muted-foreground tabular-nums">{pct(m.goalPct, 0)} of {fmtMoney(c.goalRevenue)}</span>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TD>
                    <TD><Badge variant={STATUS_TONE[c.status]} className="capitalize">{c.status}</Badge></TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-down"
                          onClick={() => { if (confirm(`Delete campaign "${c.name}"?`)) { deleteCampaign(c.id); flash("Campaign deleted"); } }}>
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
        <CampaignDialog
          campaign={editing}
          onClose={() => setEditing(null)}
          onSave={(c) => { upsertCampaign(c); setEditing(null); flash("Campaign saved"); }}
        />
      )}
      <Notice msg={notice} />
    </div>
  );
}

function blankCampaign(): Campaign {
  return {
    id: uid("cmp"), name: "", channel: "email", status: "draft",
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

function CampaignDialog({ campaign, onClose, onSave }: { campaign: Campaign; onClose: () => void; onSave: (c: Campaign) => void }) {
  const [f, setF] = useState<Campaign>({ ...campaign });
  const set = <K extends keyof Campaign>(k: K, v: Campaign[K]) => setF((p) => ({ ...p, [k]: v }));
  const numOr = (v: string) => (v === "" ? undefined : Number(v));

  return (
    <Modal
      title={campaign.name ? "Edit campaign" : "New campaign"}
      subtitle="Assign to a product and channel, set a goal, and wire the UTM used for attribution."
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!f.name.trim()} onClick={() => onSave(f)}>Save campaign</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" className="col-span-2">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Virtual Try-On Insider Launch" />
        </Field>
        <Field label="Product ID" hint="Matches Orders/Telemetry productId for revenue attribution.">
          <Input value={f.productId ?? ""} onChange={(e) => set("productId", e.target.value)} placeholder="vto" />
        </Field>
        <Field label="Product name">
          <Input value={f.productName ?? ""} onChange={(e) => set("productName", e.target.value)} placeholder="Virtual Try-On" />
        </Field>
        <Field label="Channel">
          <Select value={f.channel} onChange={(e) => set("channel", e.target.value as Channel)}>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set("status", e.target.value as CampaignStatus)}>
            {(["draft", "scheduled", "active", "paused", "ended"] as CampaignStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Budget">
          <Input type="number" value={f.budget ?? ""} onChange={(e) => set("budget", numOr(e.target.value))} placeholder="4000" />
        </Field>
        <Field label="Spend to date">
          <Input type="number" value={f.spend ?? ""} onChange={(e) => set("spend", numOr(e.target.value))} placeholder="1180" />
        </Field>
        <Field label="Revenue goal">
          <Input type="number" value={f.goalRevenue ?? ""} onChange={(e) => set("goalRevenue", numOr(e.target.value))} placeholder="60000" />
        </Field>
        <Field label="Coupon code" hint="Coupon this campaign hands out.">
          <Input value={f.couponCode ?? ""} onChange={(e) => set("couponCode", e.target.value)} placeholder="INSIDER20" />
        </Field>
        <Field label="utm_source"><Input value={f.utmSource ?? ""} onChange={(e) => set("utmSource", e.target.value)} placeholder="insiders" /></Field>
        <Field label="utm_medium"><Input value={f.utmMedium ?? ""} onChange={(e) => set("utmMedium", e.target.value)} placeholder="email" /></Field>
        <Field label="utm_campaign" hint="The attribution key telemetry is matched on."><Input value={f.utmCampaign ?? ""} onChange={(e) => set("utmCampaign", e.target.value)} placeholder="vto-launch" /></Field>
        <Field label="Start date"><Input type="date" value={f.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} /></Field>
        <Field label="End date"><Input type="date" value={f.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} /></Field>
        <Field label="Notes" className="col-span-2">
          <Textarea value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Audience, creative, sequencing…" />
        </Field>
      </div>
    </Modal>
  );
}
