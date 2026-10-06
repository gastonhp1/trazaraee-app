import { newPublicId } from "./ids";
import { sendOrQueue } from "./send";

export type PhotoSubject = "assets" | "lots";

/**
 * Sube una foto (ya reducida) a un equipo o lote. Sin conexión queda en la cola, con la imagen
 * guardada en el dispositivo, y se envía sola después. El photo_id lo genera el cliente, así que
 * reintentar nunca duplica la foto.
 *
 * `forceQueue`: usarlo cuando el equipo o lote se acaba de crear y esa creación quedó en la cola;
 * la foto tiene que ir detrás.
 */
export async function uploadPhoto(
  kind: PhotoSubject,
  id: string,
  blob: Blob,
  label: string,
  opts: { forceQueue?: boolean } = {},
): Promise<{ photoId: string; queued: boolean }> {
  const photoId = newPublicId();
  const res = await sendOrQueue({
    method: "POST",
    path: `/${kind}/${id}/photos?photo_id=${photoId}`,
    raw: { blob, contentType: "image/jpeg" },
    id: `photo:${photoId}`,
    description: `Foto de ${label}`,
    forceQueue: opts.forceQueue,
  });
  return { photoId, queued: res.queued };
}
