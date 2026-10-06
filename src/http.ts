import { loadSettings } from "./settings";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/** No hubo respuesta del servidor: sin conexión, servidor caído, etc. */
export class NetworkError extends Error {}

export type Method = "GET" | "POST";

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string; loc?: unknown[] };
      const where = Array.isArray(first.loc) ? first.loc.filter((p) => p !== "body").join(".") : "";
      return where ? `${where}: ${first.msg ?? "dato inválido"}` : (first.msg ?? fallback);
    }
  }
  return fallback;
}

export async function request<T>(method: Method, path: string, body?: unknown, auth = true): Promise<T> {
  const { apiUrl, stationKey } = loadSettings();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) headers["X-Station-Key"] = stationKey;

  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NetworkError("Sin conexión con el servidor");
  }

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* respuesta sin JSON */
    }
    const code =
      payload && typeof payload === "object" && "code" in payload ? String((payload as { code: unknown }).code) : undefined;
    throw new ApiError(errorMessage(payload, `Error ${res.status}`), res.status, code);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  public: <T>(path: string) => request<T>("GET", path, undefined, false),
};

/** Errores que justifican reintentar más tarde en vez de descartar la operación. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof NetworkError) return true;
  if (err instanceof ApiError) return [502, 503, 504].includes(err.status) || err.code === "conflicto_cadena";
  return false;
}
