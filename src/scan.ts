export interface Scanned {
  /** "a" = activo, "l" = lote, null = ID suelto (sin saber de qué tipo es) */
  kind: "a" | "l" | null;
  id: string;
}

/** Acepta la URL completa del QR (…/a/<id>) o el ID pelado, escrito a mano. */
export function parseScan(raw: string): Scanned | null {
  const text = raw.trim();
  const url = text.match(/\/([al])\/([a-z2-7]{10,26})\/?(?:[?#].*)?$/i);
  if (url) return { kind: url[1].toLowerCase() as "a" | "l", id: url[2].toLowerCase() };
  if (/^[a-z2-7]{10,26}$/i.test(text)) return { kind: null, id: text.toLowerCase() };
  return null;
}
