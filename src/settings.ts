const KEY = "trazaraee.settings";

export interface Settings {
  apiUrl: string;
  stationKey: string;
}

const DEFAULT_API: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return { apiUrl: parsed.apiUrl || DEFAULT_API, stationKey: parsed.stationKey || "" };
    }
  } catch {
    /* almacenamiento bloqueado o corrupto: se usan los valores por defecto */
  }
  return { apiUrl: DEFAULT_API, stationKey: "" };
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify({ apiUrl: s.apiUrl.replace(/\/+$/, ""), stationKey: s.stationKey.trim() }));
}

export function isConfigured(): boolean {
  return loadSettings().stationKey.length > 0;
}
