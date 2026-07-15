/**
 * A/B TEST manager for CTA / copy experiments, tied to a heatmap element_id so
 * results line up with the click-heatmap. Each variant tracks impressions /
 * clicks / conversions; a two-proportion z-test flags the winner and confidence.
 * Total recorded clicks on the element_id are pulled live from Telemetry as a
 * sanity check against the manually-tracked variant totals. Copy can be drafted
 * by the codex-proxy.
 */
import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Plus, Pencil, Trash2, Play, Square, Trophy, Sparkles, Loader2, Crosshair } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchTelemetry, type TelemetryEvent } from "@/lib/ecommerce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/Empty";
import { upsertABTest, deleteABTest, uid, type ABTest, type ABVariant, type ABStatus } from "./store";
import { useMarketing } from "./useStore";
import { abSignificance } from "./metrics";
import { Modal, Field, Select, Textarea, StatTile, ViewHeader, Meter, Notice, pct, SeedBadge } from "./ui";
import { generateCopy } from "./llm";

const STATUS_TONE: Record<ABStatus, "ok" | "muted" | "warn"> = { running: "ok", draft: "muted", stopped: "warn" };

/** Count clicks recorded on a given element_id across telemetry (heatmap tie). */
function elementClicks(events: TelemetryEvent[], elementId: string): number {
  if (!elementId) return 0;
  const id = elementId.toLowerCase();
  let n = 0;
  for (const e of events) {
    if (String(e.elementId ?? "").toLowerCase() !== id) continue;
    const name = String(e.event ?? e.eventType ?? "").toLowerCase();
    if (/click|tap|cta/.test(name) || String(e.eventType).toLowerCase() === "click") n++;
  }
  return n;
}

export function ABTestsView({ config }: { config: AppConfig }) {
  const { abTests } = useMarketing();
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [editing, setEditing] = useState<ABTest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function flash(m: string) { setNotice(m); setTimeout(() => setNotice(null), 2500); }

  useEffect(() => {
    let alive = true;
    fetchTelemetry(config).then((e) => { if (alive) setEvents(e); }).catch(() => {});
    return () => { alive = false; };
  }, [config]);

  const running = abTests.filter((t) => t.status === "running").length;

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="A/B tests"
        subtitle="CTA & copy experiments tied to heatmap element IDs, with significance testing."
        actions={<Button size="sm" onClick={() => setEditing(blankTest())}><Plus /> New test</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<FlaskConical className="h-4 w-4" />} label="Tests" value={String(abTests.length)} sub={`${running} running`} />
        <StatTile icon={<Trophy className="h-4 w-4" />} label="Called" value={String(abTests.filter((t) => t.winner).length)} />
        <StatTile icon={<Crosshair className="h-4 w-4" />} label="Elements tracked" value={String(new Set(abTests.map((t) => t.elementId)).size)} />
        <StatTile label="Impressions" value={abTests.reduce((s, t) => s + t.variants.reduce((a, v) => a + v.impressions, 0), 0).toLocaleString()} />
      </div>

      {abTests.length === 0 ? (
        <Empty icon={<FlaskConical className="h-8 w-8" />} title="No experiments yet" hint="Create a CTA or copy test and tie it to a heatmap element_id." />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {abTests.map((t) => (
            <TestCard key={t.id} test={t} elementClicksTotal={elementClicks(events, t.elementId)}
              onEdit={() => setEditing(t)}
              onToggle={() => { upsertABTest({ ...t, status: t.status === "running" ? "stopped" : "running" }); }}
              onDelete={() => { if (confirm(`Delete test "${t.name}"?`)) { deleteABTest(t.id); flash("Deleted"); } }}
              onDeclare={(k) => { upsertABTest({ ...t, winner: k, status: "stopped" }); flash(`Variant ${k} declared winner`); }}
            />
          ))}
        </div>
      )}

      {editing && (
        <TestDialog config={config} test={editing} onClose={() => setEditing(null)}
          onSave={(t) => { upsertABTest(t); setEditing(null); flash("Test saved"); }} />
      )}
      <Notice msg={notice} />
    </div>
  );
}

function TestCard({
  test, elementClicksTotal, onEdit, onToggle, onDelete, onDeclare,
}: {
  test: ABTest;
  elementClicksTotal: number;
  onEdit: () => void; onToggle: () => void; onDelete: () => void; onDeclare: (k: string) => void;
}) {
  const sig = useMemo(() => abSignificance(test.variants), [test.variants]);
  const maxCvr = Math.max(...test.variants.map((v) => (v.impressions ? v.conversions / v.impressions : 0)), 0.0001);
  const trackedClicks = test.variants.reduce((s, v) => s + v.clicks, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center">{test.name}{test._seed && <SeedBadge />}</CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant={STATUS_TONE[test.status]} className="capitalize">{test.status}</Badge>
            <span className="font-mono">#{test.elementId}</span>
            {test.pageUrl && <span>{test.pageUrl}</span>}
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title={test.status === "running" ? "Stop" : "Start"} onClick={onToggle}>
            {test.status === "running" ? <Square className="h-3.5 w-3.5 text-warn" /> : <Play className="h-3.5 w-3.5 text-ok" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-down" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {test.hypothesis && <p className="text-xs italic text-muted-foreground">“{test.hypothesis}”</p>}

        {sig && (
          <div className={`flex items-center gap-2 rounded-md border p-2 text-xs ${sig.enough ? "border-ok/40 bg-ok/10 text-ok" : "border-border bg-muted/50 text-muted-foreground"}`}>
            <Trophy className="h-4 w-4 shrink-0" />
            {sig.enough
              ? <span>Variant <b>{sig.winner}</b> leads by <b>{pct(sig.uplift, 0)}</b> — {pct(sig.confidence, 0)} confidence.</span>
              : <span>Variant {sig.winner} ahead, but not enough data yet for significance.</span>}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {test.variants.map((v) => {
            const ctr = v.impressions ? v.clicks / v.impressions : 0;
            const cvr = v.impressions ? v.conversions / v.impressions : 0;
            const isWinner = test.winner === v.key;
            return (
              <div key={v.key} className={`rounded-md border p-2 ${isWinner ? "border-ok/50 bg-ok/5" : "border-border/60"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-[11px] font-semibold">{v.key}</span>
                    <span className="text-xs font-medium">{v.label}</span>
                    {isWinner && <Badge variant="ok" className="text-[10px]">winner</Badge>}
                  </div>
                  {test.status !== "draft" && !test.winner && (
                    <button className="text-[11px] text-muted-foreground hover:text-ok" onClick={() => onDeclare(v.key)}>declare winner</button>
                  )}
                </div>
                <div className="mt-1 rounded bg-muted/40 px-2 py-1 text-[11px]">
                  <span className="font-mono">CTA:</span> “{v.ctaText}”{v.headline ? ` · ${v.headline}` : ""}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11px] tabular-nums text-muted-foreground">
                  <span>{v.impressions.toLocaleString()} impr</span>
                  <span>CTR {pct(ctr)}</span>
                  <span className="text-foreground">CVR {pct(cvr)}</span>
                </div>
                <Meter className="mt-1" value={cvr / maxCvr} tone={isWinner ? "ok" : "primary"} />
              </div>
            );
          })}
        </div>

        <div className="flex justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          <span>Tracked clicks: <b className="text-foreground">{trackedClicks.toLocaleString()}</b></span>
          <span>Telemetry on #{test.elementId}: <b className={elementClicksTotal ? "text-foreground" : ""}>{elementClicksTotal.toLocaleString()}</b></span>
        </div>
      </CardContent>
    </Card>
  );
}

function blankTest(): ABTest {
  return {
    id: uid("ab"), name: "", elementId: "", status: "draft", createdAt: Date.now(),
    variants: [
      { key: "A", label: "Control", ctaText: "", weight: 50, impressions: 0, clicks: 0, conversions: 0 },
      { key: "B", label: "Variant", ctaText: "", weight: 50, impressions: 0, clicks: 0, conversions: 0 },
    ],
  };
}

function TestDialog({ config, test, onClose, onSave }: { config: AppConfig; test: ABTest; onClose: () => void; onSave: (t: ABTest) => void }) {
  const [f, setF] = useState<ABTest>(structuredClone(test));
  const [drafting, setDrafting] = useState(false);
  const set = <K extends keyof ABTest>(k: K, v: ABTest[K]) => setF((p) => ({ ...p, [k]: v }));

  function setVar(i: number, patch: Partial<ABVariant>) {
    setF((p) => ({ ...p, variants: p.variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) }));
  }
  function addVariant() {
    const key = String.fromCharCode(65 + f.variants.length);
    setF((p) => ({ ...p, variants: [...p.variants, { key, label: `Variant ${key}`, ctaText: "", weight: 50, impressions: 0, clicks: 0, conversions: 0 }] }));
  }
  function removeVariant(i: number) {
    if (f.variants.length <= 2) return;
    setF((p) => ({ ...p, variants: p.variants.filter((_, idx) => idx !== i) }));
  }

  async function draftCtas() {
    setDrafting(true);
    const out = await generateCopy(config,
      `Suggest ${f.variants.length} distinct CTA button labels (max 4 words each) for an A/B test named "${f.name || "CTA test"}". ` +
      `Hypothesis: ${f.hypothesis || "improve click-through"}. Return one CTA per line, no numbering.`,
      { maxTokens: 120, temperature: 0.9 });
    setDrafting(false);
    if (!out) return;
    const lines = out.split("\n").map((l) => l.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean);
    setF((p) => ({ ...p, variants: p.variants.map((v, i) => (lines[i] ? { ...v, ctaText: lines[i] } : v)) }));
  }

  return (
    <Modal
      title={test.name ? "Edit A/B test" : "New A/B test"}
      subtitle="Tie the test to the element_id the CTA renders on so results align with the heatmap."
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!f.name.trim() || !f.elementId.trim()} onClick={() => onSave(f)}>Save test</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Test name" className="col-span-2"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Home hero CTA" /></Field>
        <Field label="Heatmap element_id" hint="The telemetry element_id this CTA fires on."><Input className="font-mono" value={f.elementId} onChange={(e) => set("elementId", e.target.value)} placeholder="hero-cta" /></Field>
        <Field label="Page URL"><Input value={f.pageUrl ?? ""} onChange={(e) => set("pageUrl", e.target.value)} placeholder="/" /></Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set("status", e.target.value as ABStatus)}>
            {(["draft", "running", "stopped"] as ABStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Hypothesis" className="col-span-2"><Textarea value={f.hypothesis ?? ""} onChange={(e) => set("hypothesis", e.target.value)} placeholder="Outcome-led copy beats feature-led." /></Field>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">Variants</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={draftCtas} disabled={drafting}>{drafting ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft CTAs</Button>
          <Button variant="ghost" size="sm" onClick={addVariant}><Plus /> Variant</Button>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {f.variants.map((v, i) => (
          <div key={i} className="rounded-md border border-border/60 p-2">
            <div className="flex items-center justify-between">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-[11px] font-semibold">{v.key}</span>
              {f.variants.length > 2 && <button className="text-[11px] text-muted-foreground hover:text-down" onClick={() => removeVariant(i)}>remove</button>}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Label"><Input value={v.label} onChange={(e) => setVar(i, { label: e.target.value })} /></Field>
              <Field label="CTA text"><Input value={v.ctaText} onChange={(e) => setVar(i, { ctaText: e.target.value })} placeholder="Get My Quote" /></Field>
              <Field label="Headline (optional)" className="col-span-2"><Input value={v.headline ?? ""} onChange={(e) => setVar(i, { headline: e.target.value })} /></Field>
              <Field label="Impressions"><Input type="number" value={v.impressions} onChange={(e) => setVar(i, { impressions: Number(e.target.value) })} /></Field>
              <Field label="Clicks"><Input type="number" value={v.clicks} onChange={(e) => setVar(i, { clicks: Number(e.target.value) })} /></Field>
              <Field label="Conversions"><Input type="number" value={v.conversions} onChange={(e) => setVar(i, { conversions: Number(e.target.value) })} /></Field>
              <Field label="Weight"><Input type="number" value={v.weight} onChange={(e) => setVar(i, { weight: Number(e.target.value) })} /></Field>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
