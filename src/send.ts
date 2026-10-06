import { ApiError, isRetryable, request } from "./http";
import { enqueue } from "./queue";

export type SendResult<T> = { queued: false; data: T } | { queued: true };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envía una operación de escritura. Si no hay conexión (o el servidor tuvo un conflicto de
 * concurrencia que no se resolvió), la guarda en la cola offline para reintentarla después.
 * Todas las operaciones llevan IDs generados en el cliente, así que reintentar no duplica nada.
 */
export async function sendOrQueue<T>(op: {
  method: "POST";
  path: string;
  body: unknown;
  description: string;
}): Promise<SendResult<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await enqueue(op);
    return { queued: true };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return { queued: false, data: await request<T>(op.method, op.path, op.body) };
    } catch (err) {
      if (err instanceof ApiError && err.code === "conflicto_cadena" && attempt < 2) {
        await sleep(150 * (attempt + 1));
        continue;
      }
      if (isRetryable(err)) {
        await enqueue(op);
        return { queued: true };
      }
      throw err;
    }
  }
  await enqueue(op);
  return { queued: true };
}
