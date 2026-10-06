/** Lado máximo de la foto que se sube (en píxeles). Alcanza para leer una etiqueta de serie. */
export const MAX_SIDE = 1600;

export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Reduce y recomprime la foto en el dispositivo antes de guardarla o subirla.
 *
 * Además de ahorrar datos y espacio, volver a codificar la imagen en un canvas descarta todos los
 * metadatos EXIF, incluida la ubicación GPS con la que muchos celulares etiquetan las fotos.
 */
export async function prepareImage(file: Blob, maxSide = MAX_SIDE, quality = 0.8): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // 'from-image' respeta la orientación con la que el celular guardó la foto.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("No se pudo leer la imagen. Probá sacar la foto de nuevo.");
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la imagen.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!out) throw new Error("No se pudo procesar la imagen.");
    return out;
  } finally {
    bitmap.close();
  }
}
