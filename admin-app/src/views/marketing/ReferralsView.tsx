/**
 * REFERRAL tracking — one code per referrer with a funnel of clicks → signups →
 * conversions, attributed revenue and the reward owed. Records live in the local
 * marketing store. Reward owed is computed from the reward type × conversions /
 * revenue so you can reconcile payouts at a glance.
 */
import { useMemo, useState } from "react";
import { Share2, Plus, Pencil, Trash2, Copy, TrendingUp, Users, DollarSign, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { fmtMoney } from "@/lib/utils";
import { upsertReferral, deleteReferral, uid, type Referral, type ReferralStatus } from "./store";
import { useMarketing } from "./useStore";
import { Modal, Field, Select, StatTile, ViewHeader, Meter, Notice, pct, SeedBadge } from "./ui";

function rewardOwed(r: Referral): number {
  if (r.rewardType === "percent") return (r.revenue * r.rewardValue) / 100;
  if (r.rewardType === "fixed") return r.conversions * r.rewardValue; // per converted referral
  return r.conversions * r.rewardValue; // credit per conversion
}

function rewardLabel(r: Referral): string {
  if (r.rewardType === "percent") return `${r.rewardValue}% of revenue`;
  if (r.rewardType === "fixed") return `${fmtMoney(r.rewardValue)} / conversion`;
  return `${fmtMoney(r.rewardValue)} credit`;
}

const STATUS_TONE: Record<ReferralStatus, "ok" | "warn" | "muted"> = { active: "ok", paused: "warn", ended: "muted" };

export function ReferralsView() {
  const { referrals } = useMarketing();
  const [editing, setEditing] = useState<Referral | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function flash(m: string) { setNotice(m); setTimeout(() => setNotice(null), 2500); }

  const totals = useMemo(() => {
    const clicks = referrals.reduce((s, r) => s + r.clicks, 0);
    const signups = referrals.reduce((s, r) => s + r.signups, 0);
    const conversions = referrals.reduce((s, r) => s + r.conversions, 0);
    const revenue = referrals.reduce((s, r) => s + r.revenue, 0);
    const owed = referrals.reduce((s, r) => s + rewardOwed(r), 0);
    return { clicks, signups, conversions, revenue, owed };
  }, [referrals]);

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Referrals"
        subtitle="Referrer codes with a clicks → signups → conversions funnel and reward owed."
        actions={<Button size="sm" onClick={() => setEditing(blankReferral())}><Plus /> New referrer</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile icon={<Share2 className="h-4 w-4" />} label="Referrers" value={String(referrals.length)} />
        <StatTile icon={<Users className="h-4 w-4" />} label="Signups" value={totals.signups.toLocaleString()} sub={`${totals.clicks.toLocaleString()} clicks`} />
        <StatTile icon={<TrendingUp className="h-4 w-4" />} label="Conversions" value={totals.conversions.toLocaleString()} />
        <StatTile icon={<DollarSign className="h-4 w-4" />} label="Referred revenue" value={fmtMoney(totals.revenue)} />
        <StatTile icon={<Gift className="h-4 w-4" />} label="Rewards owed" value={fmtMoney(totals.owed)} />
      </div>

      {referrals.length === 0 ? (
        <Empty icon={<Share2 className="h-8 w-8" />} title="No referrers yet" hint="Add a referrer and track their funnel." />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Referrer</TH>
                <TH>Code</TH>
                <TH className="text-right">Clicks</TH>
                <TH className="text-right">Signups</TH>
                <TH className="text-right">Conv.</TH>
                <TH className="w-32">Conv. rate</TH>
                <TH className="text-right">Revenue</TH>
                <TH>Reward</TH>
                <TH className="text-right">Owed</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {referrals.map((r) => {
                const convRate = r.clicks ? r.conversions / r.clicks : 0;
                return (
                  <TR key={r.id}>
                    <TD>
                      <div className="flex items-center font-medium">{r.referrerName}{r._seed && <SeedBadge />}</div>
                      <div className="text-[11px] text-muted-foreground">{r.referrerEmail}</div>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1 font-mono">
                        {r.code}
                        <button className="text-muted-foreground hover:text-foreground" title="Copy"
                          onClick={() => { navigator.clipboard?.writeText(r.code); flash(`Copied ${r.code}`); }}><Copy className="h-3 w-3" /></button>
                      </div>
                    </TD>
                    <TD className="text-right tabular-nums">{r.clicks.toLocaleString()}</TD>
                    <TD className="text-right tabular-nums">{r.signups.toLocaleString()}</TD>
                    <TD className="text-right tabular-nums">{r.conversions.toLocaleString()}</TD>
                    <TD>
                      <div className="flex flex-col gap-1">
                        <Meter value={convRate} tone={convRate >= 0.05 ? "ok" : "primary"} />
                        <span className="text-[10px] tabular-nums text-muted-foreground">{pct(convRate)}</span>
                      </div>
                    </TD>
                    <TD className="text-right tabular-nums">{fmtMoney(r.revenue, r.currency)}</TD>
                    <TD className="text-[11px] text-muted-foreground">{rewardLabel(r)}</TD>
                    <TD className="text-right font-medium tabular-nums">{fmtMoney(rewardOwed(r), r.currency)}</TD>
                    <TD><Badge variant={STATUS_TONE[r.status]} className="capitalize">{r.status}</Badge></TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-down"
                          onClick={() => { if (confirm(`Delete referrer ${r.referrerName}?`)) { deleteReferral(r.id); flash("Deleted"); } }}>
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
        <ReferralDialog referral={editing} onClose={() => setEditing(null)}
          onSave={(r) => { upsertReferral(r); setEditing(null); flash("Referrer saved"); }} />
      )}
      <Notice msg={notice} />
    </div>
  );
}

function blankReferral(): Referral {
  return {
    id: uid("ref"), code: "", referrerName: "", referrerEmail: "", rewardType: "percent", rewardValue: 10,
    clicks: 0, signups: 0, conversions: 0, revenue: 0, currency: "USD", status: "active", createdAt: Date.now(),
  };
}

function ReferralDialog({ referral, onClose, onSave }: { referral: Referral; onClose: () => void; onSave: (r: Referral) => void }) {
  const [f, setF] = useState<Referral>({ ...referral });
  const set = <K extends keyof Referral>(k: K, v: Referral[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      title={referral.referrerName ? "Edit referrer" : "New referrer"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!f.referrerName.trim() || !f.code.trim()} onClick={() => onSave({ ...f, code: f.code.trim().toUpperCase() })}>Save</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Referrer name"><Input value={f.referrerName} onChange={(e) => set("referrerName", e.target.value)} placeholder="Beth Hurigan" /></Field>
        <Field label="Referrer email"><Input value={f.referrerEmail} onChange={(e) => set("referrerEmail", e.target.value)} placeholder="beth@example.com" /></Field>
        <Field label="Referral code"><Input className="font-mono" value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="BETH-DSM" /></Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set("status", e.target.value as ReferralStatus)}>
            {(["active", "paused", "ended"] as ReferralStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Reward type">
          <Select value={f.rewardType} onChange={(e) => set("rewardType", e.target.value as Referral["rewardType"])}>
            <option value="percent">% of revenue</option>
            <option value="fixed">Fixed / conversion</option>
            <option value="credit">Account credit</option>
          </Select>
        </Field>
        <Field label="Reward value"><Input type="number" value={f.rewardValue} onChange={(e) => set("rewardValue", Number(e.target.value))} /></Field>
        <Field label="Clicks"><Input type="number" value={f.clicks} onChange={(e) => set("clicks", Number(e.target.value))} /></Field>
        <Field label="Signups"><Input type="number" value={f.signups} onChange={(e) => set("signups", Number(e.target.value))} /></Field>
        <Field label="Conversions"><Input type="number" value={f.conversions} onChange={(e) => set("conversions", Number(e.target.value))} /></Field>
        <Field label="Revenue"><Input type="number" value={f.revenue} onChange={(e) => set("revenue", Number(e.target.value))} /></Field>
      </div>
    </Modal>
  );
}
