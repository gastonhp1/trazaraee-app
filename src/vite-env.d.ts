/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base de la API (por defecto http://localhost:8000) */
  readonly VITE_API_URL?: string;
  /** URL pública que codifican los QR (por defecto, el origen de la app) */
  readonly VITE_PUBLIC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
