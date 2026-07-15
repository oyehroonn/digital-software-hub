/**
 * Insider-launch email BLAST composer. Audience is the opted-in insider list
 * derived from the Orders sheet (customers grouped by email), filterable by tier
 * / product / spend. Copy can be drafted by the codex-proxy (degrades to manual
 * when the proxy is down). Sends go through the stable Email API and every
 * recipient is written to the send-log.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Send, Sparkles, Users, Mail, ShieldOff, Loader2, Info,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchOrders, type Order } from "@/lib/ecommerce";
import { runtime } from "@/lib/rpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney } from "@/lib/utils";
import { deriveMembers, type Member } from "./metrics";
import { useMarketing } from "./useStore";
import { sendBlast, type Recipient } from "./email";
import { generateCopy } from "./llm";
import { Field, Select, Textarea, StatTile, ViewHeader, Notice, Meter } from "./ui";
import { suppressEmail } from "./store";

type TierFilter = "all" | "VIP" | "Repeat" | "New";

export function BlastComposer({ config }: { config: AppConfig }) {
  const { campaigns, coupons, suppress } = useMarketing();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [campaignId, setCampaignId] = useState("");
  const [tier, setTier] = useState<TierFilter>("all");
  const [product, setProduct] = useState("all");
  const [onlyOptedIn, setOnlyOptedIn] = useState(true);
  const [subject, setSubject] = useState("You're in first: {{name}}, your insider access is live");
  const [body, setBody] = useState(
    "Hi {{name}},\n\nAs one of our insiders you get first access before we announce publicly.\n\nUse code INSIDER20 for 20% off — 48 hours only.\n\n— The DSM team",
  );
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function flash(m: string) { setNotice(m); setTimeout(() => setNotice(null), 3000); }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchOrders(config).then((o) => { if (alive) { setOrders(o); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [config]);

  const members = useMemo(() => deriveMembers(orders, suppress), [orders, suppress]);
  const productOptions = useMemo(() => {
    const s = new Set<string>();
    for (const m of members) m.products.forEach((p) => s.add(p));
    return [...s].sort();
  }, [members]);

  const audience = useMemo(() => {
    return members.filter((m) => {
      if (onlyOptedIn && !m.optedIn) return false;
      if (tier !== "all" && m.tier !== tier) return false;
      if (product !== "all" && !m.products.includes(product)) return false;
      return true;
    });
  }, [members, tier, product, onlyOptedIn]);

  async function draftWithAI() {
    setDrafting(true);
    const camp = campaigns.find((c) => c.id === campaignId);
    const prompt =
      `Write a short insider-launch marketing email.\n` +
      `Product: ${camp?.productName ?? "DSM precision 3D software"}.\n` +
      `Audience: opted-in existing customers (insiders) getting 48h early access.\n` +
      (camp?.couponCode ? `Include coupon code ${camp.couponCode}.\n` : "") +
      `Use {{name}} as a greeting token. Return the subject line on the first line prefixed "Subject:", then a blank line, then the body. Plain text, no emojis.`;
    const out = await generateCopy(config, prompt, { maxTokens: 400 });
    setDrafting(false);
    if (!out) { flash("AI drafting unavailable — the codex-proxy is offline. Edit manually."); return; }
    const m = out.match(/^\s*subject:\s*(.+?)\n([\s\S]*)$/i);
    if (m) { setSubject(m[1].trim()); setBody(m[2].trim()); }
    else setBody(out);
    flash("Draft generated. Review before sending.");
  }

  async function send() {
    if (!subject.trim() || !body.trim()) { flash("Add a subject and body first."); return; }
    if (audience.length === 0) { flash("No recipients match this audience."); return; }
    const camp = campaigns.find((c) => c.id === campaignId);
    const warn = runtime.isTauri
      ? `Send this blast to ${audience.length} recipient(s)? This sends real email.`
      : `Preview mode (desktop app not detected): ${audience.length} sends will be logged as simulated. Continue?`;
    if (!confirm(warn)) return;

    setSending(true);
    setProgress({ done: 0, total: audience.length });
    const recipients: Recipient[] = audience.map((m) => ({ email: m.email, name: m.name }));
    const res = await sendBlast(config, {
      subject, body, recipients,
      campaignId: camp?.id, campaignName: camp?.name, kind: "blast",
      onProgress: (done, total) => setProgress({ done, total }),
    });
    setSending(false);
    setProgress(null);
    flash(`Done — ${res.sent} sent, ${res.simulated} simulated, ${res.failed} failed. See Send log.`);
  }

  const totalSpend = audience.reduce((s, m) => s + m.totalSpend, 0);

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Insider blast composer"
        subtitle="Email opted-in members first. Audience is your Orders sheet, grouped by customer."
      />

      {!runtime.isTauri && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Running outside the desktop app — the Email API bridge is unavailable, so sends will be recorded as <b>simulated</b> (nothing leaves your machine). Everything else works.</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <StatTile icon={<Users className="h-4 w-4" />} label="Recipients" value={audience.length.toLocaleString()} sub={loading ? "loading…" : `${members.length} members total`} />
        <StatTile icon={<Mail className="h-4 w-4" />} label="Insider spend" value={fmtMoney(totalSpend)} />
        <StatTile icon={<ShieldOff className="h-4 w-4" />} label="Suppressed" value={String(suppress.length)} />
        <StatTile icon={<Sparkles className="h-4 w-4" />} label="VIPs" value={String(audience.filter((m) => m.tier === "VIP").length)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
        {/* Composer */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Message</CardTitle>
            <Button variant="outline" size="sm" onClick={draftWithAI} disabled={drafting}>
              {drafting ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft with AI
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field label="Campaign" hint="Optional — links the blast to a campaign in the send-log.">
              <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">— none —</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
            <Field label="Body" hint="Tokens: {{name}}, {{email}}.">
              <Textarea className="min-h-[220px] font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            {coupons.filter((c) => c.active).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                Insert code:
                {coupons.filter((c) => c.active).map((c) => (
                  <button key={c.id} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono hover:bg-accent"
                    onClick={() => setBody((b) => `${b} ${c.code}`)}>{c.code}</button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audience + send */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>Audience</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Field label="Tier">
                <Select value={tier} onChange={(e) => setTier(e.target.value as TierFilter)}>
                  <option value="all">All tiers</option>
                  <option value="VIP">VIP (≥ $5k)</option>
                  <option value="Repeat">Repeat buyers</option>
                  <option value="New">New (1 order)</option>
                </Select>
              </Field>
              <Field label="Bought product">
                <Select value={product} onChange={(e) => setProduct(e.target.value)}>
                  <option value="all">Any product</option>
                  {productOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={onlyOptedIn} onChange={(e) => setOnlyOptedIn(e.target.checked)} />
                Opted-in only (exclude suppressed)
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              {sending && progress && (
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground"><span>Sending…</span><span>{progress.done}/{progress.total}</span></div>
                  <Meter value={progress.total ? progress.done / progress.total : 0} />
                </div>
              )}
              <Button className="w-full" disabled={sending || audience.length === 0} onClick={send}>
                {sending ? <Loader2 className="animate-spin" /> : <Send />}
                {sending ? "Sending…" : `Send to ${audience.length}`}
              </Button>
              <PreviewList audience={audience} onSuppress={(email) => { suppressEmail(email); flash(`${email} suppressed`); }} />
            </CardContent>
          </Card>
        </div>
      </div>
      <Notice msg={notice} />
    </div>
  );
}

function PreviewList({ audience, onSuppress }: { audience: Member[]; onSuppress: (email: string) => void }) {
  const show = audience.slice(0, 8);
  if (audience.length === 0) return <p className="text-center text-xs text-muted-foreground">No recipients match.</p>;
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Recipients preview</div>
      {show.map((m) => (
        <div key={m.email} className="flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1 text-xs">
          <div className="min-w-0">
            <div className="truncate font-medium">{m.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{m.email}</div>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant={m.tier === "VIP" ? "ok" : "muted"} className="text-[10px]">{m.tier}</Badge>
            <button className="text-muted-foreground hover:text-down" title="Suppress" onClick={() => onSuppress(m.email)}><ShieldOff className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      ))}
      {audience.length > show.length && <div className="text-center text-[11px] text-muted-foreground">+{audience.length - show.length} more</div>}
    </div>
  );
}
