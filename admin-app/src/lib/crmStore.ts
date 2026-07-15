/**
 * Local CRM state — the human layer the analytics feeds can't provide:
 * lead status, tags, freeform notes, follow-up tasks and saved segments.
 *
 * Persisted to localStorage (same offline-first pattern as offlineQueue) and
 * keyed by a stable `contactKey` (lowercased email, else `id:<leadId>`), so a
 * lead and the customer they later become share one record. A tiny pub/sub lets
 * every CRM view stay live without prop-drilling.
 */
import type { LeadStatus } from "./crm";

export interface CrmNote {
  id: string;
  body: string;
  createdAt: number;
  author: string;
}

export interface ContactRecord {
  key: string;
  status?: LeadStatus;
  tags: string[];
  notes: CrmNote[];
  updatedAt: number;
}

export interface Task {
  id: string;
  contactKey: string;
  contactLabel: string;
  title: string;
  dueAt: number | null;
  done: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface Segment {
  id: string;
  name: string;
  /** Serialized filter criteria (see SegmentBuilder). */
  criteria: Record<string, unknown>;
  createdAt: number;
}

interface CrmState {
  contacts: Record<string, ContactRecord>;
  tasks: Task[];
  segments: Segment[];
}

const LS_KEY = "dsm-admin.crm";
type Listener = (state: CrmState) => void;
const listeners = new Set<Listener>();

function read(): CrmState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<CrmState>;
      return { contacts: s.contacts ?? {}, tasks: s.tasks ?? [], segments: s.segments ?? [] };
    }
  } catch {
    /* fall through to empty */
  }
  return { contacts: {}, tasks: [], segments: [] };
}

function write(state: CrmState) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  listeners.forEach((l) => l(state));
}

export function getState(): CrmState {
  return read();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn(read());
  return () => {
    listeners.delete(fn);
  };
}

function uid(prefix = ""): string {
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ── Contacts (status / tags / notes) ─────────────────────────────────────── */

export function getContact(key: string): ContactRecord {
  return read().contacts[key] ?? { key, tags: [], notes: [], updatedAt: 0 };
}

function mutateContact(key: string, fn: (r: ContactRecord) => void) {
  const state = read();
  const rec = state.contacts[key] ?? { key, tags: [], notes: [], updatedAt: 0 };
  fn(rec);
  rec.updatedAt = Date.now();
  state.contacts[key] = rec;
  write(state);
}

export function setStatus(key: string, status: LeadStatus) {
  mutateContact(key, (r) => {
    r.status = status;
  });
}

export function addTag(key: string, tag: string) {
  const t = tag.trim();
  if (!t) return;
  mutateContact(key, (r) => {
    if (!r.tags.includes(t)) r.tags.push(t);
  });
}

export function removeTag(key: string, tag: string) {
  mutateContact(key, (r) => {
    r.tags = r.tags.filter((x) => x !== tag);
  });
}

export function addNote(key: string, body: string, author = "admin") {
  const b = body.trim();
  if (!b) return;
  mutateContact(key, (r) => {
    r.notes.unshift({ id: uid("n_"), body: b, createdAt: Date.now(), author });
  });
}

export function deleteNote(key: string, noteId: string) {
  mutateContact(key, (r) => {
    r.notes = r.notes.filter((n) => n.id !== noteId);
  });
}

/** All distinct tags in use — powers tag filters and the segment builder. */
export function allTags(): string[] {
  const set = new Set<string>();
  for (const c of Object.values(read().contacts)) for (const t of c.tags) set.add(t);
  return [...set].sort();
}

/* ── Tasks / follow-up reminders ──────────────────────────────────────────── */

export function listTasks(): Task[] {
  return read().tasks.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity);
  });
}

export function tasksForContact(key: string): Task[] {
  return read().tasks.filter((t) => t.contactKey === key);
}

export function openTaskCount(): number {
  return read().tasks.filter((t) => !t.done).length;
}

export function addTask(input: {
  contactKey: string;
  contactLabel: string;
  title: string;
  dueAt: number | null;
}): Task {
  const state = read();
  const task: Task = {
    id: uid("t_"),
    contactKey: input.contactKey,
    contactLabel: input.contactLabel,
    title: input.title.trim() || "Follow up",
    dueAt: input.dueAt,
    done: false,
    createdAt: Date.now(),
  };
  state.tasks.push(task);
  write(state);
  return task;
}

export function toggleTask(id: string) {
  const state = read();
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  t.completedAt = t.done ? Date.now() : undefined;
  write(state);
}

export function deleteTask(id: string) {
  const state = read();
  state.tasks = state.tasks.filter((t) => t.id !== id);
  write(state);
}

/* ── Saved segments ───────────────────────────────────────────────────────── */

export function listSegments(): Segment[] {
  return read().segments.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export function saveSegment(name: string, criteria: Record<string, unknown>): Segment {
  const state = read();
  const seg: Segment = { id: uid("s_"), name: name.trim() || "Untitled segment", criteria, createdAt: Date.now() };
  state.segments.push(seg);
  write(state);
  return seg;
}

export function deleteSegment(id: string) {
  const state = read();
  state.segments = state.segments.filter((s) => s.id !== id);
  write(state);
}
