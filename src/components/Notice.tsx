import type { ReactNode } from "react";

export function Queued() {
  return (
    <p className="notice">
      Sin conexión: la operación quedó guardada en este dispositivo y se enviará sola cuando vuelva la señal.
    </p>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
