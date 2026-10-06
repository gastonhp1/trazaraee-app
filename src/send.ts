import { ApiError, isRetryable, request, type RawBody } from "./http";
import { enqueue, listQueue } from "./queue";

export type SendResult<T> = { queued: false; data: T } | { queued: true };

export interface SendOp {
  method: "POST";
  path: string;
  body?: unknown;
  /** Cuerpo binario (foto) en vez de JSON. */
  raw?: RawBody;
  /** Identificador de la operación en la cola (si no, se deduce del cuerpo). */
  id?: string;
  description: string;
  /** Encolar siempre: la operación depende de otra que ya quedó en la cola. */
  forceQueue?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toQueued(op: SendOp) {
  return {
    method: op.method,
    path: op.path,
    body: op.body,
    description: op.description,
    id: op.id,
    blob: op.raw?.blob,
    contentType: op.raw?.contentType,
  };
}

/**
 * Envía una operación de escritura. Si no hay conexión (o el servidor tuvo un conflicto de
 * concurrencia que no se resolvió), la guarda en la cola offline para reintentarla después.
 * Todas las operaciones llevan IDs generados en el cliente, así que reintentar no duplica nada.
 */
export async function sendOrQueue<T>(op: SendOp): Promise<SendResult<T>> {
  const queue = async (): Promise<SendResult<T>> => {
    await enqueue(toQueued(op));
    return { queued: true };
  };

  if (op.forceQueue || (typeof navigator !== "undefined" && navigator.onLine === false)) return queue();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return { queued: false, data: await request<T>(op.method, op.path, op.body, true, op.raw) };
    } catch (err) {
      if (err instanceof ApiError && err.code === "conflicto_cadena" && attempt < 2) {
        await sleep(150 * (attempt + 1));
        continue;
      }
      if (isRetryable(err)) return queue();
      // El lote o equipo puede estar todavía en la cola (se creó sin conexión y aún no se
      // sincronizó): se encola detrás de él para respetar el orden en vez de fallar.
      if (err instanceof ApiError && err.status === 404 && (await listQueue()).length > 0) return queue();
      throw err;
    }
  }
  return queue();
}
