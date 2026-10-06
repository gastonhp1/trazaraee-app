import { get, set } from "idb-keyval";
import { ApiError, isRetryable, request } from "./http";

// Cola de operaciones pendientes, guardada en IndexedDB. Sobrevive a cerrar la app.
// Se procesa en orden: un lote debe existir antes de que se cree un equipo dentro de él.

export interface QueueItem {
  id: string;
  method: "POST";
  path: string;
  body: unknown;
  description: string;
  createdAt: string;
}

export interface FailedItem extends QueueItem {
  error: string;
}

const QUEUE_KEY = "queue";
const FAILED_KEY = "queue-failed";

let tail: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => undefined);
  return run;
}

function notify() {
  window.dispatchEvent(new Event("queue-changed"));
}

export async function listQueue(): Promise<QueueItem[]> {
  return (await get<QueueItem[]>(QUEUE_KEY)) ?? [];
}

export async function listFailed(): Promise<FailedItem[]> {
  return (await get<FailedItem[]>(FAILED_KEY)) ?? [];
}

export function enqueue(op: Omit<QueueItem, "id" | "createdAt">): Promise<void> {
  return locked(async () => {
    const items = await listQueue();
    const body = op.body as { client_id?: string; public_id?: string } | null;
    const id = body?.client_id ?? body?.public_id ?? crypto.randomUUID();
    if (!items.some((i) => i.id === id)) {
      items.push({ ...op, id, createdAt: new Date().toISOString() });
      await set(QUEUE_KEY, items);
    }
    notify();
  });
}

export interface FlushResult {
  sent: number;
  failed: number;
  remaining: number;
}

export function flushQueue(): Promise<FlushResult> {
  return locked(async () => {
    let items = await listQueue();
    const failed = await listFailed();
    let sent = 0;
    let newlyFailed = 0;

    while (items.length > 0) {
      const item = items[0];
      try {
        await request(item.method, item.path, item.body);
        items = items.slice(1);
        sent++;
      } catch (err) {
        if (isRetryable(err)) break; // seguimos después, conservando el orden
        const message = err instanceof ApiError || err instanceof Error ? err.message : "Error desconocido";
        failed.push({ ...item, error: message });
        items = items.slice(1);
        newlyFailed++;
      }
      await set(QUEUE_KEY, items);
      await set(FAILED_KEY, failed);
    }

    await set(QUEUE_KEY, items);
    await set(FAILED_KEY, failed);
    notify();
    return { sent, failed: newlyFailed, remaining: items.length };
  });
}

export function retryFailed(id: string): Promise<void> {
  return locked(async () => {
    const failed = await listFailed();
    const item = failed.find((f) => f.id === id);
    if (!item) return;
    const { error: _error, ...rest } = item;
    void _error;
    await set(FAILED_KEY, failed.filter((f) => f.id !== id));
    await set(QUEUE_KEY, [...(await listQueue()), rest]);
    notify();
  });
}

export function discardFailed(id: string): Promise<void> {
  return locked(async () => {
    await set(FAILED_KEY, (await listFailed()).filter((f) => f.id !== id));
    notify();
  });
}
