import { useMemo, useState } from "react";
import { Filter, Save, Trash2, ClipboardCopy, Layers } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { fmtMoney } from "@/lib/utils";
import {
  contactKey,
  SOURCE_LABEL,
  type Customer,
  type LeadSource,
  type LeadStatus,
  type ScoredLead,
} from "@/lib/crm";
import * as store from "@/lib/crmStore";
import { SourceBadge, StatCard, useCrmStore } from "./components";
import { Select } from "./LeadInbox";

interface Criteria {
  entity: "leads" | "customers";
  source: LeadSource | "any";
  grade: "any" | "A" | "B" | "C" | "D";
  minScore: number;
  status: LeadStatus | "any";
  tag: string;
  licenseState: "any" | "active" | "expiring" | "expired" | "none";
  minSpend: number;
  dormantDays: number;
}

const DEFAULT: Criteria = {
  entity: "leads",
  source: "any",
  grade: "any",
  minScore: 0,
  status: "any",
  tag: "",
  licenseState: "any",
  minSpend: 0,
  dormantDays: 0,
};

const GRADE_FLOOR: Record<string, number> = { A: 75, B: 55, C: 35, D: 0 };
const SOURCES: LeadSource[] = ["quote", "savings", "beta", "callback", "bulk-quote", "upgrade", "contact"];
const STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];

export function SegmentBuilder({ leads, customers }: { leads: ScoredLead[]; customers: Customer[] }) {
  const [c, setC] = useState<Criteria>(DEFAULT);
  const [name, setName] = useState("");
  const crm = useCrmStore();
  const set = (patch: Partial<Criteria>) => setC((prev) => ({ ...prev, ...patch }));

  const matchedLeads = useMemo(() => {
    if (c.entity !== "leads") return [];
    return leads.filter((l) => {
      const rec = crm.contacts[contactKey(l)];
      if (c.source !== "any" && l.source !== c.source) return false;
      if (c.grade !== "any" && l.scoring.score < GRADE_FLOOR[c.grade]) return false;
      if (l.scoring.score < c.minScore) return false;
      if (c.status !== "any" && (rec?.status ?? "new") !== c.status) return false;
      if (c.tag && !(rec?.tags ?? []).includes(c.tag)) return false;
      return true;
    });
  }, [c, leads, crm]);

  const matchedCustomers = useMemo(() => {
    if (c.entity !== "customers") return [];
    const now = Date.now();
    return customers.filter((cust) => {
      const rec = crm.contacts[contactKey(cust)];
      if (c.status !== "any" && (rec?.status ?? "new") !== c.status) return false;
      if (c.tag && !(rec?.tags ?? []).includes(c.tag)) return false;
      if (c.minSpend > 0 && cust.totalSpend < c.minSpend) return false;
      if (c.licenseState !== "any") {
        if (c.licenseState === "active" && cust.activeLicenses === 0) return false;
        if (c.licenseState === "expiring" && cust.expiringLicenses === 0) return false;
        if (c.licenseState === "expired" && cust.expiredLicenses === 0) return false;
        if (c.licenseState === "none" && cust.licenses.length > 0) return false;
      }
      if (c.dormantDays > 0) {
        const days = cust.lastOrderTs ? (now - cust.lastOrderTs) / 86_400_000 : Infinity;
        if (days < c.dormantDays) return false;
      }
      return true;
    });
  }, [c, customers, crm]);

  const emails =
    c.entity === "leads"
      ? matchedLeads.map((l) => l.email).filter(Boolean)
      : matchedCustomers.map((cu) => cu.email).filter(Boolean);
  const count = c.entity === "leads" ? matchedLeads.length : matchedCustomers.length;

  const savedSegments = store.listSegments();
  const knownTags = store.allTags();

  const copyEmails = () => {
    if (emails.length && navigator.clipboard) navigator.clipboard.writeText([...new Set(emails)].join(", "));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Filter className="h-4 w-4" /> Build a segment
          </div>

          <FieldRow label="Audience">
            <Select value={c.entity} onChange={(v) => setC({ ...DEFAULT, entity: v as Criteria["entity"] })}>
              <option value="leads">Leads</option>
              <option value="customers">Customers</option>
            </Select>
          </FieldRow>

          {c.entity === "leads" && (
            <>
              <FieldRow label="Source">
                <Select value={c.source} onChange={(v) => set({ source: v as Criteria["source"] })}>
                  <option value="any">Any source</option>
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </FieldRow>
              <FieldRow label="Grade">
                <Select value={c.grade} onChange={(v) => set({ grade: v as Criteria["grade"] })}>
                  <option value="any">Any</option>
                  <option value="A">A</option>
                  <option value="B">B+</option>
                  <option value="C">C+</option>
                </Select>
              </FieldRow>
              <FieldRow label={`Min score: ${c.minScore}`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={c.minScore}
                  onChange={(e) => set({ minScore: Number(e.target.value) })}
                  className="w-full accent-[hsl(var(--primary))]"
                />
              </FieldRow>
            </>
          )}

          {c.entity === "customers" && (
            <>
              <FieldRow label="Licence state">
                <Select value={c.licenseState} onChange={(v) => set({ licenseState: v as Criteria["licenseState"] })}>
                  <option value="any">Any</option>
                  <option value="active">Has active</option>
                  <option value="expiring">Has expiring</option>
                  <option value="expired">Has expired</option>
                  <option value="none">No licences</option>
                </Select>
              </FieldRow>
              <FieldRow label="Min lifetime spend">
                <Input
                  type="number"
                  value={c.minSpend || ""}
                  onChange={(e) => set({ minSpend: Number(e.target.value) || 0 })}
                  placeholder="0"
                  className="h-9"
                />
              </FieldRow>
              <FieldRow label="Dormant at least (days)">
                <Input
                  type="number"
                  value={c.dormantDays || ""}
                  onChange={(e) => set({ dormantDays: Number(e.target.value) || 0 })}
                  placeholder="0"
                  className="h-9"
                />
              </FieldRow>
            </>
          )}

          <FieldRow label="Status">
            <Select value={c.status} onChange={(v) => set({ status: v as Criteria["status"] })}>
              <option value="any">Any status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </FieldRow>
          <FieldRow label="Has tag">
            <Select value={c.tag} onChange={(v) => set({ tag: v })}>
              <option value="">Any tag</option>
              {knownTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </FieldRow>

          <div className="mt-1 flex items-center gap-2 border-t border-border/60 pt-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Segment name…" className="h-9" />
            <Button
              size="sm"
              disabled={!name.trim()}
              onClick={() => {
                store.saveSegment(name, { ...c });
                setName("");
              }}
            >
              <Save /> Save
            </Button>
          </div>

          {savedSegments.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-border/60 pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Saved</div>
              {savedSegments.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-accent">
                  <button className="truncate text-left text-sm" onClick={() => setC({ ...DEFAULT, ...(s.criteria as unknown as Criteria) })}>
                    <Layers className="mr-1 inline h-3 w-3 opacity-60" />
                    {s.name}
                  </button>
                  <button onClick={() => store.deleteSegment(s.id)} className="text-muted-foreground hover:text-down">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Matches" value={count} tone={count > 0 ? "ok" : "default"} />
            <StatCard label="With email" value={new Set(emails).size} />
            <StatCard
              label={c.entity === "customers" ? "Segment value" : "Avg score"}
              value={
                c.entity === "customers"
                  ? fmtMoney(matchedCustomers.reduce((s, cu) => s + cu.totalSpend, 0))
                  : matchedLeads.length
                    ? Math.round(matchedLeads.reduce((s, l) => s + l.scoring.score, 0) / matchedLeads.length)
                    : 0
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Live preview of who's in this segment.</span>
            <Button size="sm" variant="outline" onClick={copyEmails} disabled={emails.length === 0}>
              <ClipboardCopy /> Copy {new Set(emails).size} emails
            </Button>
          </div>

          {count === 0 ? (
            <Empty icon={<Filter className="h-8 w-8" />} title="No matches" hint="Loosen the criteria to widen the segment." />
          ) : (
            <div className="flex max-h-[calc(100vh-320px)] flex-col gap-1 overflow-y-auto rounded-lg border border-border p-2">
              {c.entity === "leads"
                ? matchedLeads.map((l) => (
                    <div key={l.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/50">
                      <div>
                        <div className="text-sm font-medium">{l.name || l.email || "Anonymous"}</div>
                        <div className="text-[11px] text-muted-foreground">{l.email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <SourceBadge source={l.source} />
                        <Badge variant="muted">{l.scoring.score}</Badge>
                      </div>
                    </div>
                  ))
                : matchedCustomers.map((cu) => (
                    <div key={cu.email || cu.name} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/50">
                      <div>
                        <div className="text-sm font-medium">{cu.name || cu.email}</div>
                        <div className="text-[11px] text-muted-foreground">{cu.email}</div>
                      </div>
                      <div className="flex items-center gap-2 text-xs tabular-nums">
                        <span>{fmtMoney(cu.totalSpend, cu.currency)}</span>
                        {cu.expiringLicenses > 0 && <Badge variant="warn">{cu.expiringLicenses} exp</Badge>}
                      </div>
                    </div>
                  ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
