import { useMemo, useState } from "react";
import { Inbox, Search, Mail, Phone, Building2, ExternalLink, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { timeAgo, fmtMoney } from "@/lib/utils";
import {
  contactKey,
  SOURCE_LABEL,
  type LeadSource,
  type ScoredLead,
} from "@/lib/crm";
import {
  ScoreBadge,
  ScoreMeter,
  SourceBadge,
  StatCard,
  StatusControl,
  StatusBadge,
  TagsEditor,
  NotesPanel,
  AddTaskInline,
  SeedBadge,
  useCrmStore,
} from "./components";

const SOURCES: LeadSource[] = ["quote", "savings", "beta", "callback", "bulk-quote", "upgrade", "contact"];

export function LeadInbox({
  leads,
  seeded,
  onOpenCustomer,
}: {
  leads: ScoredLead[];
  seeded: boolean;
  onOpenCustomer?: (email: string) => void;
}) {
  const [q, setQ] = useState("");
  const [source, setSource] = useState<LeadSource | "all">("all");
  const [minGrade, setMinGrade] = useState<"all" | "A" | "B" | "C">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const crm = useCrmStore();

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const gradeFloor = minGrade === "A" ? 75 : minGrade === "B" ? 55 : minGrade === "C" ? 35 : 0;
    return leads.filter((l) => {
      if (source !== "all" && l.source !== source) return false;
      if (l.scoring.score < gradeFloor) return false;
      if (t) {
        const hay = `${l.name} ${l.email} ${l.company} ${l.productInterest} ${l.intent}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [leads, q, source, minGrade]);

  const stats = useMemo(() => {
    const hot = leads.filter((l) => l.scoring.grade === "A" || l.scoring.grade === "B").length;
    const untouched = leads.filter((l) => (crm.contacts[contactKey(l)]?.status ?? "new") === "new").length;
    const avg = leads.length ? Math.round(leads.reduce((s, l) => s + l.scoring.score, 0) / leads.length) : 0;
    return { hot, untouched, avg };
  }, [leads, crm]);

  const selected = useMemo(() => filtered.find((l) => l.id === selectedId) ?? null, [filtered, selectedId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open leads" value={leads.length} hint={seeded ? "seed" : "live"} />
        <StatCard label="Hot (A/B)" value={stats.hot} tone="ok" />
        <StatCard label="Untouched" value={stats.untouched} tone="warn" />
        <StatCard label="Avg score" value={stats.avg} hint="out of 100" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads…" className="w-56 pl-8" />
        </div>
        <Select value={source} onChange={(v) => setSource(v as LeadSource | "all")}>
          <option value="all">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={minGrade} onChange={(v) => setMinGrade(v as "all" | "A" | "B" | "C")}>
          <option value="all">Any grade</option>
          <option value="A">A only</option>
          <option value="B">B and up</option>
          <option value="C">C and up</option>
        </Select>
        {seeded && <SeedBadge label="seed leads" />}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <div className="rounded-lg border border-border">
          {filtered.length === 0 ? (
            <Empty icon={<Inbox className="h-8 w-8" />} title="No leads match" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Lead</TH>
                  <TH>Source</TH>
                  <TH className="text-right">Score</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((l) => {
                  const key = contactKey(l);
                  const status = crm.contacts[key]?.status ?? "new";
                  return (
                    <TR
                      key={l.id}
                      className={
                        "cursor-pointer " + (selectedId === l.id ? "bg-accent/60" : "")
                      }
                      onClick={() => setSelectedId(l.id)}
                    >
                      <TD className="whitespace-nowrap text-muted-foreground" title={l.capturedAt}>
                        {l.ts ? timeAgo(l.ts) : "—"}
                        {l.captures > 1 && (
                          <span className="ml-1 rounded bg-primary/15 px-1 text-[10px] text-primary">×{l.captures}</span>
                        )}
                      </TD>
                      <TD>
                        <div className="font-medium">{l.name || "Anonymous"}</div>
                        <div className="text-[11px] text-muted-foreground">{l.email || l.company || "—"}</div>
                      </TD>
                      <TD>
                        <SourceBadge source={l.source} />
                      </TD>
                      <TD className="text-right">
                        <ScoreBadge score={l.scoring.score} grade={l.scoring.grade} />
                      </TD>
                      <TD>
                        <StatusBadge value={status} />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </div>

        {selected ? (
          <LeadDetail key={selected.id} lead={selected} onOpenCustomer={onOpenCustomer} />
        ) : (
          <div className="hidden rounded-lg border border-dashed border-border/70 xl:flex xl:items-center xl:justify-center">
            <div className="p-8 text-center text-sm text-muted-foreground">
              <UserRound className="mx-auto mb-2 h-8 w-8 opacity-50" />
              Select a lead to see its score breakdown, tags, notes & follow-ups.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LeadDetail({ lead, onOpenCustomer }: { lead: ScoredLead; onOpenCustomer?: (email: string) => void }) {
  const key = contactKey(lead);
  return (
    <div className="flex max-h-[calc(100vh-180px)] flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-card p-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-base font-semibold">{lead.name || "Anonymous lead"}</div>
            <SourceBadge source={lead.source} />
          </div>
          <ScoreBadge score={lead.scoring.score} grade={lead.scoring.grade} />
        </div>
        <div className="mt-3 flex flex-col gap-1 text-sm">
          {lead.email && (
            <a className="flex items-center gap-2 text-primary hover:underline" href={`mailto:${lead.email}`}>
              <Mail className="h-3.5 w-3.5" /> {lead.email}
            </a>
          )}
          {lead.phone && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5" /> {lead.phone}
            </span>
          )}
          {lead.company && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" /> {lead.company}
            </span>
          )}
        </div>
        {lead.email && onOpenCustomer && (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => onOpenCustomer(lead.email)}>
            <ExternalLink /> Open Customer 360
          </Button>
        )}
      </div>

      {lead.intent && (
        <div className="rounded-md border border-border/70 bg-background/50 px-3 py-2 text-sm italic text-muted-foreground">
          “{lead.intent}”
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        {lead.productInterest && <Field label="Interest" value={lead.productInterest} />}
        {lead.budget != null && <Field label="Budget" value={fmtMoney(lead.budget)} />}
        {lead.teamSize != null && <Field label="Team size" value={String(lead.teamSize)} />}
        {lead.estSavings != null && <Field label="Est. savings" value={fmtMoney(lead.estSavings)} />}
      </div>

      <Section title={`Score ${lead.scoring.score}/100`}>
        <div className="mb-2 grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span>Form intent</span>
              <span className="tabular-nums">{lead.scoring.intentPoints}/55</span>
            </div>
            <ScoreMeter value={lead.scoring.intentPoints} max={55} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span>Behavior</span>
              <span className="tabular-nums">{lead.scoring.behaviorPoints}/45</span>
            </div>
            <ScoreMeter value={lead.scoring.behaviorPoints} max={45} />
          </div>
        </div>
        <ul className="flex flex-col gap-0.5">
          {lead.scoring.reasons.map((r, i) => (
            <li key={i} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="tabular-nums text-ok">+{r.points}</span>
            </li>
          ))}
          {lead.scoring.reasons.length === 0 && (
            <li className="text-xs text-muted-foreground">No positive signals captured yet.</li>
          )}
        </ul>
      </Section>

      <Section title="Status">
        <StatusControl contactKey={key} />
      </Section>
      <Section title="Tags">
        <TagsEditor contactKey={key} />
      </Section>
      <Section title="Follow-up">
        <AddTaskInline contactKey={key} contactLabel={lead.name || lead.email || "Lead"} />
      </Section>
      <Section title="Notes">
        <NotesPanel contactKey={key} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/60 pt-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

export function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {children}
    </select>
  );
}
