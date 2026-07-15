/**
 * Shared presentational + interactive bits for the CRM area:
 * grade/score badges, source & status pills, stat cards, and the live
 * tags / notes / tasks / status editors (all wired to crmStore).
 */
import { useEffect, useState } from "react";
import { Tag, X, StickyNote, Trash2, Plus, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SOURCE_LABEL, type Grade, type LeadSource, type LeadStatus } from "@/lib/crm";
import * as store from "@/lib/crmStore";

/* ── Badges ───────────────────────────────────────────────────────────────── */

const GRADE_STYLE: Record<Grade, string> = {
  A: "bg-ok/15 text-ok border-ok/30",
  B: "bg-primary/15 text-primary border-primary/30",
  C: "bg-warn/15 text-warn border-warn/30",
  D: "bg-muted text-muted-foreground border-border",
};

export function ScoreBadge({ score, grade }: { score: number; grade: Grade }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums",
        GRADE_STYLE[grade],
      )}
      title={`Lead score ${score}/100 (grade ${grade})`}
    >
      <span className="text-[13px]">{grade}</span>
      <span className="opacity-70">{score}</span>
    </span>
  );
}

/** Slim 0–100 meter for score breakdowns. */
export function ScoreMeter({ value, max = 100, className }: { value: number; max?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

const SOURCE_VARIANT: Record<LeadSource, "default" | "muted" | "ok" | "warn"> = {
  quote: "default",
  "bulk-quote": "default",
  callback: "ok",
  upgrade: "warn",
  savings: "muted",
  beta: "muted",
  contact: "muted",
};

export function SourceBadge({ source }: { source: LeadSource }) {
  return <Badge variant={SOURCE_VARIANT[source]}>{SOURCE_LABEL[source]}</Badge>;
}

const STATUS_ORDER: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];
const STATUS_STYLE: Record<LeadStatus, string> = {
  new: "bg-primary/15 text-primary",
  contacted: "bg-warn/15 text-warn",
  qualified: "bg-ok/15 text-ok",
  won: "bg-ok/25 text-ok",
  lost: "bg-down/15 text-down",
};

export function StatusPicker({ value, onChange }: { value: LeadStatus; onChange: (s: LeadStatus) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {STATUS_ORDER.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={cn(
            "rounded-md px-2 py-0.5 text-xs font-medium capitalize transition-colors",
            value === s ? STATUS_STYLE[s] : "text-muted-foreground hover:bg-accent",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export function StatusBadge({ value }: { value: LeadStatus }) {
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium capitalize", STATUS_STYLE[value])}>{value}</span>
  );
}

/* ── Stat card ────────────────────────────────────────────────────────────── */

export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "ok" | "warn" | "down";
}) {
  const toneCls =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "down" ? "text-down" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-semibold tabular-nums", toneCls)}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/* ── Live contact editors (status / tags / notes / tasks) ─────────────────── */

/** Subscribe to the CRM store so editors re-render on any change anywhere. */
export function useCrmStore(): ReturnType<typeof store.getState> {
  const [state, setState] = useState(store.getState());
  useEffect(() => store.subscribe(setState), []);
  return state;
}

export function StatusControl({ contactKey }: { contactKey: string }) {
  const state = useCrmStore();
  const status = state.contacts[contactKey]?.status ?? "new";
  return <StatusPicker value={status} onChange={(s) => store.setStatus(contactKey, s)} />;
}

export function TagsEditor({ contactKey }: { contactKey: string }) {
  const state = useCrmStore();
  const tags = state.contacts[contactKey]?.tags ?? [];
  const [draft, setDraft] = useState("");
  const suggestions = store.allTags().filter((t) => !tags.includes(t)).slice(0, 6);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet</span>}
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs">
            <Tag className="h-3 w-3 opacity-60" />
            {t}
            <button onClick={() => store.removeTag(contactKey, t)} className="text-muted-foreground hover:text-down">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              store.addTag(contactKey, draft);
              setDraft("");
            }
          }}
          placeholder="Add a tag…"
          className="h-8 w-40"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            store.addTag(contactKey, draft);
            setDraft("");
          }}
        >
          <Plus /> Add
        </Button>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => store.addTag(contactKey, s)}
              className="rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotesPanel({ contactKey }: { contactKey: string }) {
  const state = useCrmStore();
  const notes = state.contacts[contactKey]?.notes ?? [];
  const [draft, setDraft] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Log a call, a next step, context…"
          rows={2}
          className="flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button
          size="sm"
          onClick={() => {
            store.addNote(contactKey, draft);
            setDraft("");
          }}
          disabled={!draft.trim()}
        >
          <StickyNote /> Save
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {notes.length === 0 && <div className="text-xs text-muted-foreground">No notes logged.</div>}
        {notes.map((n) => (
          <div key={n.id} className="group rounded-md border border-border/70 bg-card px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {n.author} · {new Date(n.createdAt).toLocaleString()}
              </span>
              <button
                onClick={() => store.deleteNote(contactKey, n.id)}
                className="text-muted-foreground opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="whitespace-pre-wrap text-sm">{n.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compact add-a-follow-up control bound to a contact. */
export function AddTaskInline({ contactKey, contactLabel }: { contactKey: string; contactLabel: string }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Follow-up task…"
        className="h-8 w-52"
      />
      <div className="relative">
        <CalendarClock className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 w-40 pl-8" />
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={!title.trim()}
        onClick={() => {
          store.addTask({
            contactKey,
            contactLabel,
            title,
            dueAt: due ? Date.parse(due) : null,
          });
          setTitle("");
          setDue("");
        }}
      >
        <Plus /> Add task
      </Button>
    </div>
  );
}

/* ── Sub-tab nav ──────────────────────────────────────────────────────────── */

export function SubTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; badge?: number }[];
  active: T;
  onChange: (k: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border pb-2">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
            active === t.key
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          {t.label}
          {t.badge != null && t.badge > 0 && (
            <span className="rounded bg-primary/20 px-1.5 text-[10px] font-medium text-primary">{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SeedBadge({ label = "seed data" }: { label?: string }) {
  return (
    <Badge variant="warn" title="Showing deterministic seed data until the live read endpoint ships.">
      {label}
    </Badge>
  );
}
