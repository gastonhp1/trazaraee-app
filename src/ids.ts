const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** ID público opaco (base32, 13 caracteres). Se genera en el dispositivo para poder etiquetar sin conexión. */
export function newPublicId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  let value = 0;
  let bits = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** ID de operación: hace idempotentes los reintentos de la cola offline. */
export function newClientId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return newPublicId() + newPublicId();
}

export const PUBLIC_ID_RE = /^[a-z2-7]{10,26}$/;
