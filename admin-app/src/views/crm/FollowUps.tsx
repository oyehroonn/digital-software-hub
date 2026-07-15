import { useMemo, useState } from "react";
import { CheckSquare, Square, Trash2, Plus, CalendarClock, AlarmClock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/Empty";
import { cn } from "@/lib/utils";
import * as store from "@/lib/crmStore";
import { StatCard, useCrmStore } from "./components";

const DAY = 86_400_000;

function bucketOf(t: store.Task, now: number): "overdue" | "today" | "upcoming" | "someday" {
  if (t.dueAt == null) return "someday";
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (t.dueAt < startOfToday) return "overdue";
  if (t.dueAt < startOfToday + DAY) return "today";
  return "upcoming";
}

const BUCKET_META: Record<string, { label: string; tone: string }> = {
  overdue: { label: "Overdue", tone: "text-down" },
  today: { label: "Due today", tone: "text-warn" },
  upcoming: { label: "Upcoming", tone: "text-foreground" },
  someday: { label: "No date", tone: "text-muted-foreground" },
};

export function FollowUps() {
  const crm = useCrmStore();
  const now = Date.now();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const tasks = crm.tasks;
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const overdue = open.filter((t) => bucketOf(t, now) === "overdue").length;

  const grouped = useMemo(() => {
    const g: Record<string, store.Task[]> = { overdue: [], today: [], upcoming: [], someday: [] };
    for (const t of open) g[bucketOf(t, now)].push(t);
    for (const k of Object.keys(g)) g[k].sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));
    return g;
  }, [open, now]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open tasks" value={open.length} />
        <StatCard label="Overdue" value={overdue} tone={overdue ? "down" : "default"} />
        <StatCard label="Due today" value={grouped.today.length} tone={grouped.today.length ? "warn" : "default"} />
        <StatCard label="Completed" value={done.length} tone="ok" />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && title.trim()) add();
          }}
          placeholder="New follow-up (e.g. call Beth about renewal)…"
          className="min-w-52 flex-1"
        />
        <div className="relative">
          <CalendarClock className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-40 pl-8" />
        </div>
        <Button disabled={!title.trim()} onClick={add}>
          <Plus /> Add
        </Button>
      </div>

      {open.length === 0 && done.length === 0 ? (
        <Empty
          icon={<AlarmClock className="h-8 w-8" />}
          title="No follow-ups yet"
          hint="Add reminders here, or create them straight from a lead or customer."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {(["overdue", "today", "upcoming", "someday"] as const).map((b) =>
            grouped[b].length === 0 ? null : (
              <div key={b}>
                <div className={cn("mb-1.5 text-xs font-semibold uppercase tracking-wide", BUCKET_META[b].tone)}>
                  {BUCKET_META[b].label} · {grouped[b].length}
                </div>
                <div className="flex flex-col gap-1.5">
                  {grouped[b].map((t) => (
                    <TaskRow key={t.id} task={t} now={now} />
                  ))}
                </div>
              </div>
            ),
          )}

          {done.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Completed · {done.length}
              </div>
              <div className="flex flex-col gap-1.5">
                {done.slice(0, 20).map((t) => (
                  <TaskRow key={t.id} task={t} now={now} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  function add() {
    store.addTask({ contactKey: "general", contactLabel: "General", title, dueAt: due ? Date.parse(due) : null });
    setTitle("");
    setDue("");
  }
}

function TaskRow({ task, now }: { task: store.Task; now: number }) {
  const overdue = !task.done && task.dueAt != null && task.dueAt < new Date(now).setHours(0, 0, 0, 0);
  return (
    <div className="group flex items-center gap-3 rounded-md border border-border/70 bg-card px-3 py-2">
      <button onClick={() => store.toggleTask(task.id)} className="text-muted-foreground hover:text-ok">
        {task.done ? <CheckSquare className="h-4 w-4 text-ok" /> : <Square className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm", task.done && "text-muted-foreground line-through")}>{task.title}</div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {task.contactLabel !== "General" && <span className="rounded bg-accent px-1.5">{task.contactLabel}</span>}
          {task.dueAt != null && (
            <span className={overdue ? "text-down" : ""}>
              {new Date(task.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => store.deleteTask(task.id)}
        className="text-muted-foreground opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
