/**
 * Offline Action Queue
 * ---------------------
 * A tiny, dependency-free, localStorage-backed queue for actions that must
 * eventually reach an UNSTABLE backend (VPS Flask API, box regen, product
 * edits, etc.) but must never block the UI when that backend is down.
 *
 * Contract (see BUILD_CONTEXT resilience contract):
 *  - Enqueuing NEVER throws and NEVER blocks — the page keeps working offline.
 *  - Each action `kind` has a registered async processor. When the processor
 *    resolves, the action is removed from the queue. When it rejects, the
 *    action stays queued and is retried later.
 *  - The queue auto-flushes on: registration, the browser `online` event,
 *    tab focus/visibility, and a periodic timer.
 *
 * This module is intentionally storage-agnostic beyond localStorage and holds
 * NO secrets. Processors decide how to actually talk to a backend.
 */

const STORAGE_KEY = 'dsm.offlineQueue.v1';
const FLUSH_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 25;

export interface QueuedAction<T = unknown> {
  /** Stable unique id (uuid-ish). */
  id: string;
  /** Discriminator used to look up the processor. */
  kind: string;
  /** Arbitrary JSON-serializable payload for the processor. */
  payload: T;
  /** Epoch ms when first enqueued. */
  createdAt: number;
  /** How many flush attempts have been made. */
  attempts: number;
  /** Epoch ms of the last attempt, if any. */
  lastAttemptAt?: number;
  /** Last error message, for debugging / the admin Health board. */
  lastError?: string;
}

/**
 * A processor returns a promise. Resolve → action is done and removed.
 * Reject → action is kept and retried on the next flush (until MAX_ATTEMPTS).
 */
export type ActionProcessor<T = unknown> = (payload: T, action: QueuedAction<T>) => Promise<void>;

type QueueListener = (queue: QueuedAction[]) => void;

const processors = new Map<string, ActionProcessor<any>>();
const listeners = new Set<QueueListener>();

let flushing = false;
let timer: ReturnType<typeof setInterval> | null = null;
let wired = false;

const hasWindow = typeof window !== 'undefined';

// ── Storage helpers ─────────────────────────────────────────────────────────

function readQueue(): QueuedAction[] {
  if (!hasWindow) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedAction[]): void {
  if (!hasWindow) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full / disabled (private mode). Nothing we can safely do —
    // the action is best-effort and must not crash the app.
  }
  for (const listener of listeners) {
    try {
      listener(queue);
    } catch {
      /* listener errors are never fatal */
    }
  }
}

function makeId(): string {
  if (hasWindow && 'crypto' in window && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Register (or replace) the processor for an action kind. Registering triggers
 * a flush so anything already waiting for this kind gets a chance to drain.
 */
export function registerProcessor<T = unknown>(kind: string, processor: ActionProcessor<T>): void {
  processors.set(kind, processor as ActionProcessor<any>);
  ensureWired();
  void flush();
}

/**
 * Enqueue an action. Fire-and-forget, never throws. Returns the created action
 * so the caller can optimistically reflect it in the UI if desired.
 */
export function enqueue<T = unknown>(kind: string, payload: T): QueuedAction<T> {
  const action: QueuedAction<T> = {
    id: makeId(),
    kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  };
  const queue = readQueue();
  queue.push(action as QueuedAction);
  writeQueue(queue);
  ensureWired();
  // Try immediately; if offline this is a cheap no-op that keeps the action queued.
  void flush();
  return action;
}

/** Snapshot of everything currently queued (e.g. for the admin Health board). */
export function peekAll(): QueuedAction[] {
  return readQueue();
}

/** Count of pending actions, optionally filtered by kind. */
export function pendingCount(kind?: string): number {
  const queue = readQueue();
  return kind ? queue.filter((a) => a.kind === kind).length : queue.length;
}

/** Remove a single action by id (e.g. user cancels a queued edit). */
export function remove(id: string): void {
  writeQueue(readQueue().filter((a) => a.id !== id));
}

/** Clear the whole queue (admin "discard pending" affordance). */
export function clearQueue(): void {
  writeQueue([]);
}

/** Subscribe to queue changes; returns an unsubscribe function. */
export function subscribe(listener: QueueListener): () => void {
  listeners.add(listener);
  try {
    listener(readQueue());
  } catch {
    /* ignore */
  }
  return () => listeners.delete(listener);
}

/**
 * Attempt to drain the queue. Safe to call as often as you like — it is
 * re-entrancy guarded and no-ops when offline or when nothing is queued.
 * Resolves once the pass completes.
 */
export async function flush(): Promise<void> {
  if (flushing) return;
  if (hasWindow && 'onLine' in navigator && navigator.onLine === false) return;

  const queue = readQueue();
  if (queue.length === 0) return;

  flushing = true;
  try {
    for (const action of queue) {
      const processor = processors.get(action.kind);
      if (!processor) continue; // no handler registered yet; leave it queued

      action.attempts += 1;
      action.lastAttemptAt = Date.now();

      try {
        await processor(action.payload, action);
        dropById(action.id);
      } catch (err) {
        action.lastError = err instanceof Error ? err.message : String(err);
        if (action.attempts >= MAX_ATTEMPTS) {
          // Give up permanently so a poison action can't wedge the queue.
          dropById(action.id);
        } else {
          persistAction(action);
        }
      }
    }
  } finally {
    flushing = false;
  }
}

// ── Internals ───────────────────────────────────────────────────────────────

function dropById(id: string): void {
  writeQueue(readQueue().filter((a) => a.id !== id));
}

function persistAction(updated: QueuedAction): void {
  const queue = readQueue();
  const idx = queue.findIndex((a) => a.id === updated.id);
  if (idx >= 0) {
    queue[idx] = updated;
    writeQueue(queue);
  }
}

function ensureWired(): void {
  if (wired || !hasWindow) return;
  wired = true;

  window.addEventListener('online', () => void flush());
  window.addEventListener('focus', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush();
  });

  timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  // Do not let the interval keep a Node/test process alive.
  (timer as unknown as { unref?: () => void })?.unref?.();
}

/** Test/teardown helper: stop the interval timer. */
export function _stopAutoFlush(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
