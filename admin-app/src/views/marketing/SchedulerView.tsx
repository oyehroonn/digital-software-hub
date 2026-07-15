/**
 * Promo SCHEDULER — a timeline of scheduled promos (email/social/etc.), each
 * optionally tied to a campaign and coupon. Promos are grouped into Overdue /
 * Today / Upcoming / Done buckets. A promo whose scheduled time has passed while
 * still "scheduled" is surfaced as overdue so nothing silently slips.
 */
import { useMemo, useState } from "react";
import { CalendarClock, Plus, Pencil, Trash2, Play, Check, X, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { upsertPromo, deletePromo, setPromoStatus, uid, CHANNELS, type Promo, type PromoStatus, type Channel } from "./store";
import { useMarketing } from "./useStore";
import { Modal, Field, Select, Textarea, StatTile, ViewHeader, Notice, SeedBadge } from "./ui";

const STATUS_TONE: Record<PromoStatus, "ok" | "warn" | "muted" | "down"> = {
  scheduled: "warn", live: "ok", done: "muted", cancelled: "down",
};

function isOverdue(p: Promo): boolean {
  return p.status === "scheduled" && Date.parse(p.scheduledAt) < Date.now();
}
function isToday(p: Promo): boolean {
  const d = new Date(p.scheduledAt);
  const n = new Date();
  return d.toDateString() === n.toDateString();
}

export function SchedulerView() {
  const { promos, campaigns, coupons } = useMarketing();
  const [editing, setEditing] = useState<Promo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function flash(m: string) { setNotice(m); setTimeout(() => setNotice(null), 2500); }

  const buckets = useMemo(() => {
    const sorted = [...promos].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
    return {
      overdue: sorted.filter(isOverdue),
      today: sorted.filter((p) => !isOverdue(p) && isToday(p) && p.status !== "done" && p.status !== "cancelled"),
      upcoming: sorted.filter((p) => !isOverdue(p) && !isToday(p) && Date.parse(p.scheduledAt) >= Date.now() && p.status !== "done" && p.status !== "cancelled"),
      done: sorted.filter((p) => p.status === "done" || p.status === "cancelled").reverse(),
    };
  }, [promos]);

  const campaignName = (id?: string) => campaigns.find((c) => c.id === id)?.name;

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Promo scheduler"
        subtitle="Plan and track scheduled promos across channels."
        actions={<Button size="sm" onClick={() => setEditing(blankPromo())}><Plus /> Schedule promo</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<AlertTriangle className="h-4 w-4" />} label="Overdue" value={String(buckets.overdue.length)} />
        <StatTile icon={<Clock className="h-4 w-4" />} label="Today" value={String(buckets.today.length)} />
        <StatTile icon={<CalendarClock className="h-4 w-4" />} label="Upcoming" value={String(buckets.upcoming.length)} />
        <StatTile icon={<Check className="h-4 w-4" />} label="Completed" value={String(promos.filter((p) => p.status === "done").length)} />
      </div>

      {promos.length === 0 ? (
        <Empty icon={<CalendarClock className="h-8 w-8" />} title="Nothing scheduled" hint="Schedule a promo to build your calendar." />
      ) : (
        <div className="flex flex-col gap-5">
          <Section title="Overdue" tone="down" promos={buckets.overdue} campaignName={campaignName} onEdit={setEditing} flash={flash} />
          <Section title="Today" tone="ok" promos={buckets.today} campaignName={campaignName} onEdit={setEditing} flash={flash} />
          <Section title="Upcoming" tone="warn" promos={buckets.upcoming} campaignName={campaignName} onEdit={setEditing} flash={flash} />
          <Section title="Done & cancelled" tone="muted" promos={buckets.done} campaignName={campaignName} onEdit={setEditing} flash={flash} />
        </div>
      )}

      {editing && (
        <PromoDialog promo={editing} campaigns={campaigns} coupons={coupons} onClose={() => setEditing(null)}
          onSave={(p) => { upsertPromo(p); setEditing(null); flash("Promo saved"); }} />
      )}
      <Notice msg={notice} />
    </div>
  );
}

function Section({
  title, tone, promos, campaignName, onEdit, flash,
}: {
  title: string; tone: "down" | "ok" | "warn" | "muted";
  promos: Promo[]; campaignName: (id?: string) => string | undefined;
  onEdit: (p: Promo) => void; flash: (m: string) => void;
}) {
  if (promos.length === 0) return null;
  const dot = tone === "down" ? "bg-down" : tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : "bg-muted-foreground";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${dot}`} /> {title} <span className="font-normal">({promos.length})</span>
      </div>
      <div className="flex flex-col gap-2">
        {promos.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <div className="flex w-28 shrink-0 flex-col">
              <span className="text-xs font-medium tabular-nums">{new Date(p.scheduledAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">{new Date(p.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{p.title}</span>
                {p._seed && <SeedBadge />}
                {isOverdue(p) && <Badge variant="down" className="text-[10px]">overdue</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <Badge variant="muted" className="capitalize text-[10px]">{p.channel}</Badge>
                {p.audience && <span>{p.audience}</span>}
                {campaignName(p.campaignId) && <span>· {campaignName(p.campaignId)}</span>}
                {p.couponCode && <span className="font-mono">· {p.couponCode}</span>}
              </div>
            </div>
            <Badge variant={STATUS_TONE[p.status]} className="capitalize">{p.status}</Badge>
            <div className="flex gap-1">
              {p.status === "scheduled" && (
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Mark live" onClick={() => { setPromoStatus(p.id, "live"); flash("Marked live"); }}><Play className="h-3.5 w-3.5 text-ok" /></Button>
              )}
              {(p.status === "scheduled" || p.status === "live") && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Mark done" onClick={() => { setPromoStatus(p.id, "done"); flash("Marked done"); }}><Check className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Cancel" onClick={() => { setPromoStatus(p.id, "cancelled"); flash("Cancelled"); }}><X className="h-3.5 w-3.5 text-warn" /></Button>
                </>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-down"
                onClick={() => { if (confirm(`Delete promo "${p.title}"?`)) { deletePromo(p.id); flash("Deleted"); } }}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function blankPromo(): Promo {
  const d = new Date(Date.now() + 86400000);
  d.setMinutes(0, 0, 0);
  return { id: uid("prm"), title: "", channel: "email", scheduledAt: d.toISOString(), status: "scheduled", createdAt: Date.now() };
}

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PromoDialog({
  promo, campaigns, coupons, onClose, onSave,
}: {
  promo: Promo;
  campaigns: { id: string; name: string }[];
  coupons: { code: string }[];
  onClose: () => void; onSave: (p: Promo) => void;
}) {
  const [f, setF] = useState<Promo>({ ...promo });
  const set = <K extends keyof Promo>(k: K, v: Promo[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      title={promo.title ? "Edit promo" : "Schedule promo"}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!f.title.trim()} onClick={() => onSave(f)}>Save promo</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title" className="col-span-2"><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="VTO insider email — wave 2" /></Field>
        <Field label="When">
          <Input type="datetime-local" value={toLocalInput(f.scheduledAt)} onChange={(e) => set("scheduledAt", new Date(e.target.value).toISOString())} />
        </Field>
        <Field label="Channel">
          <Select value={f.channel} onChange={(e) => set("channel", e.target.value as Channel)}>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Campaign">
          <Select value={f.campaignId ?? ""} onChange={(e) => set("campaignId", e.target.value || undefined)}>
            <option value="">— none —</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Coupon">
          <Select value={f.couponCode ?? ""} onChange={(e) => set("couponCode", e.target.value || undefined)}>
            <option value="">— none —</option>
            {coupons.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </Select>
        </Field>
        <Field label="Audience"><Input value={f.audience ?? ""} onChange={(e) => set("audience", e.target.value)} placeholder="Insiders" /></Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set("status", e.target.value as PromoStatus)}>
            {(["scheduled", "live", "done", "cancelled"] as PromoStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Notes" className="col-span-2"><Textarea value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
