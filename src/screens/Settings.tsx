import { useCallback, useEffect, useState } from "react";
import { api } from "../http";
import { discardFailed, flushQueue, listFailed, listQueue, retryFailed, type FailedItem, type QueueItem } from "../queue";
import { loadSettings, saveSettings } from "../settings";
import type { Station } from "../types";
import { Field } from "../components/Notice";
import { formatDate } from "../labels";

export function Settings() {
  const initial = loadSettings();
  const [apiUrl, setApiUrl] = useState(initial.apiUrl);
  const [stationKey, setStationKey] = useState(initial.stationKey);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<QueueItem[]>([]);
  const [failed, setFailed] = useState<FailedItem[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setPending(await listQueue());
    setFailed(await listFailed());
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener("queue-changed", refresh);
    return () => window.removeEventListener("queue-changed", refresh);
  }, [refresh]);

  async function save() {
    saveSettings({ apiUrl, stationKey });
    try {
      const me = await api.get<Station>("/stations/me");
      setStatus({ ok: true, text: `Conectado como estación “${me.name}”.` });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "No se pudo conectar" });
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      await flushQueue();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <section className="card">
        <h2>Estación</h2>
        <Field label="Dirección del servidor">
          <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} inputMode="url" autoCapitalize="none" />
        </Field>
        <Field label="Clave de la estación">
          <input
            value={stationKey}
            onChange={(e) => setStationKey(e.target.value)}
            type="password"
            autoComplete="off"
            autoCapitalize="none"
          />
        </Field>
        <button className="btn" onClick={save}>
          Guardar y probar conexión
        </button>
        {status && <p className={status.ok ? "ok" : "error"}>{status.text}</p>}
        <p className="hint">
          Las acciones quedan registradas a nombre de la estación (mesa, banco de pruebas…), no de una persona.
        </p>
      </section>

      <section className="card">
        <h2>Pendientes de enviar ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="hint">Todo sincronizado.</p>
        ) : (
          <ul className="list">
            {pending.map((p) => (
              <li key={p.id}>
                {p.description} <small>{formatDate(p.createdAt)}</small>
              </li>
            ))}
          </ul>
        )}
        <button className="btn secondary" onClick={syncNow} disabled={syncing || pending.length === 0}>
          {syncing ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
      </section>

      {failed.length > 0 && (
        <section className="card warn">
          <h2>Rechazadas por el servidor ({failed.length})</h2>
          <p className="hint">
            El servidor no aceptó estas operaciones (por ejemplo, vender un equipo sin borrado de datos). Revisalas: se
            pueden reintentar o descartar.
          </p>
          <ul className="list">
            {failed.map((f) => (
              <li key={f.id}>
                <strong>{f.description}</strong>
                <div className="error">{f.error}</div>
                <div className="row">
                  <button className="btn secondary small" onClick={() => retryFailed(f.id)}>
                    Reintentar
                  </button>
                  <button className="btn danger small" onClick={() => discardFailed(f.id)}>
                    Descartar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
