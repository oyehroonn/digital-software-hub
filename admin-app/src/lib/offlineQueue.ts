/**
 * Offline-first edit queue. Product edits and box-regen triggers are enqueued
 * locally (localStorage) and auto-pushed to the UNSTABLE VPS whenever it comes
 * back up. Nothing is lost if the VPS is down when an admin makes a change.
 */
import type { AppConfig } from "./config";
import { pushProductEdit, triggerBoxRegen, type ProductEdit } from "./products";

export type QueueItemType = "edit" | "regen";
export type QueueItemStatus = "pending" | "pushing" | "failed";

export interface QueueItem {
  id: string;
  type: QueueItemType;
  productId: string | number;
  productName?: string;
  changes?: ProductEdit;
  status: QueueItemStatus;
  attempts: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

const LS_KEY = "dsm-admin.offlineQueue";
type Listener = (items: QueueItem[]) => void;
const listeners = new Set<Listener>();

function read(): QueueItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueueItem[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
  listeners.forEach((l) => l(items));
}

export function getQueue(): QueueItem[] {
  return read();
}

export function queueSize(): number {
  return read().filter((i) => i.status !== "pushing").length;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn(read());
  return () => listeners.delete(fn);
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function enqueueEdit(
  productId: string | number,
  changes: ProductEdit,
  productName?: string,
): QueueItem {
  const items = read();
  const item: QueueItem = {
    id: uid(),
    type: "edit",
    productId,
    productName,
    changes,
    status: "pending",
    attempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  items.push(item);
  write(items);
  return item;
}

export function enqueueRegen(productId: string | number, productName?: string): QueueItem {
  const items = read();
  const item: QueueItem = {
    id: uid(),
    type: "regen",
    productId,
    productName,
    status: "pending",
    attempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  items.push(item);
  write(items);
  return item;
}

export function removeItem(id: string) {
  write(read().filter((i) => i.id !== id));
}

function patch(id: string, p: Partial<QueueItem>) {
  const items = read().map((i) => (i.id === id ? { ...i, ...p, updatedAt: Date.now() } : i));
  write(items);
}

/**
 * Attempt to push every pending item. Successful items are removed from the
 * queue; failures are marked `failed` with the error and left for the next run.
 * Returns counts. Safe to call repeatedly (e.g. when VPS health flips to up).
 */
export async function pushQueue(cfg: AppConfig): Promise<{ pushed: number; failed: number }> {
  let pushed = 0;
  let failed = 0;
  const pending = read().filter((i) => i.status !== "pushing");
  for (const item of pending) {
    patch(item.id, { status: "pushing" });
    try {
      if (item.type === "edit" && item.changes) {
        await pushProductEdit(cfg, item.productId, item.changes);
      } else if (item.type === "regen") {
        await triggerBoxRegen(cfg, item.productId);
      }
      removeItem(item.id);
      pushed++;
    } catch (e: unknown) {
      patch(item.id, {
        status: "failed",
        attempts: item.attempts + 1,
        lastError: e instanceof Error ? e.message : String(e),
      });
      failed++;
    }
  }
  return { pushed, failed };
}
