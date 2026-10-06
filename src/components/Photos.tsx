import { useCallback, useEffect, useRef, useState } from "react";
import { api, NetworkError, requestBlob } from "../http";
import { prepareImage } from "../image";
import { formatDate } from "../labels";
import { uploadPhoto, type PhotoSubject } from "../photo";
import { listQueue } from "../queue";
import type { PhotoMeta } from "../types";

const HINT =
  "Fotografiá el equipo y sus etiquetas. Evitá personas y pantallas con datos. Las fotos solo las ve el personal de la cooperativa.";

/**
 * Abre la cámara del celular (en una compu abre el selector de archivos) y devuelve las fotos
 * ya reducidas. Se usa el campo de archivo nativo con capture: funciona en cualquier navegador
 * móvil, sin permisos especiales ni código de cámara propio.
 */
export function CaptureButton({
  onBlobs,
  disabled,
  label = "Sacar foto",
}: {
  onBlobs: (blobs: Blob[]) => void | Promise<void>;
  disabled?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite sacar otra foto igual enseguida
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const blobs: Blob[] = [];
      for (const f of files) blobs.push(await prepareImage(f));
      await onBlobs(blobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar la foto");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onChange}
        data-testid="photo-input"
      />
      <button type="button" className="btn secondary" disabled={disabled || busy} onClick={() => input.current?.click()}>
        {busy ? "Procesando…" : label}
      </button>
      {error && <p className="error">{error}</p>}
    </>
  );
}

/** Fotos "en preparación", antes de que exista el lote o equipo (pantalla de ingreso). */
export function PhotoPicker({
  label,
  blobs,
  onChange,
  max = 3,
}: {
  label: string;
  blobs: Blob[];
  onChange: (blobs: Blob[]) => void;
  max?: number;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = blobs.map((b) => URL.createObjectURL(b));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [blobs]);

  return (
    <div className="photo-picker">
      <span className="picker-label">{label}</span>
      {urls.length > 0 && (
        <div className="thumbs">
          {urls.map((u, i) => (
            <div className="thumb" key={u}>
              <img src={u} alt={`Foto ${i + 1}`} />
              <button
                type="button"
                className="thumb-x"
                aria-label="Quitar foto"
                onClick={() => onChange(blobs.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {blobs.length < max && <CaptureButton onBlobs={(bs) => onChange([...blobs, ...bs].slice(0, max))} />}
      <p className="hint">{HINT}</p>
    </div>
  );
}

interface Pending {
  id: string;
  url: string;
}

/** Galería de un lote o equipo ya existente: ver, sacar nuevas y eliminar. */
export function Photos({ kind, id, label }: { kind: PhotoSubject; id: string; label: string }) {
  const [remote, setRemote] = useState<PhotoMeta[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending[]>([]);
  const [open, setOpen] = useState<PhotoMeta | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const cache = useRef<Record<string, string>>({});
  const pendingUrls = useRef<string[]>([]);

  const loadRemote = useCallback(async () => {
    if (!navigator.onLine) {
      setOffline(true); // evita pedidos que van a fallar
      return;
    }
    try {
      const list = await api.get<PhotoMeta[]>(`/${kind}/${id}/photos`);
      setRemote(list);
      setOffline(false);
      for (const p of list) {
        if (cache.current[p.public_id]) continue;
        try {
          const blob = await requestBlob(`/photos/${p.public_id}`);
          cache.current[p.public_id] = URL.createObjectURL(blob);
          setUrls({ ...cache.current });
        } catch {
          /* se reintenta en la próxima carga */
        }
      }
    } catch (e) {
      if (e instanceof NetworkError) setOffline(true);
    }
  }, [kind, id]);

  const loadPending = useCallback(async () => {
    const items = (await listQueue()).filter((i) => i.blob && i.path.startsWith(`/${kind}/${id}/photos`));
    pendingUrls.current.forEach((u) => URL.revokeObjectURL(u));
    const next = items.map((i) => ({ id: i.id, url: URL.createObjectURL(i.blob as Blob) }));
    pendingUrls.current = next.map((n) => n.url);
    setPending(next);
  }, [kind, id]);

  const refresh = useCallback(async () => {
    await loadPending();
    await loadRemote();
  }, [loadPending, loadRemote]);

  useEffect(() => {
    setRemote([]);
    setUrls({});
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener("queue-changed", onChange);
    window.addEventListener("online", onChange);
    return () => {
      window.removeEventListener("queue-changed", onChange);
      window.removeEventListener("online", onChange);
      Object.values(cache.current).forEach((u) => URL.revokeObjectURL(u));
      pendingUrls.current.forEach((u) => URL.revokeObjectURL(u));
      cache.current = {};
      pendingUrls.current = [];
    };
  }, [refresh]);

  async function onCapture(blobs: Blob[]) {
    setError(null);
    for (const b of blobs) {
      try {
        await uploadPhoto(kind, id, b, label);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo enviar la foto");
      }
    }
    await refresh();
  }

  async function remove() {
    if (!open) return;
    try {
      await api.delete(`/photos/${open.public_id}`);
      const u = cache.current[open.public_id];
      if (u) URL.revokeObjectURL(u);
      delete cache.current[open.public_id];
      setUrls({ ...cache.current });
      setOpen(null);
      await loadRemote();
    } catch (e) {
      setError(
        e instanceof NetworkError
          ? "Para eliminar una foto hace falta conexión."
          : e instanceof Error
            ? e.message
            : "No se pudo eliminar la foto",
      );
    } finally {
      setConfirm(false);
    }
  }

  const total = remote.length + pending.length;
  return (
    <section className="card">
      <h2>Fotos{total > 0 ? ` (${total})` : ""}</h2>
      {offline && <p className="notice">Sin conexión: las fotos ya enviadas se ven cuando vuelva la señal.</p>}
      {total > 0 && (
        <div className="thumbs">
          {remote.map((p) => (
            <button
              key={p.public_id}
              type="button"
              className="thumb"
              aria-label="Ver foto"
              onClick={() => {
                setOpen(p);
                setConfirm(false);
              }}
            >
              {urls[p.public_id] ? <img src={urls[p.public_id]} alt="Foto" /> : <span className="thumb-loading">…</span>}
            </button>
          ))}
          {pending.map((p) => (
            <div key={p.id} className="thumb pending">
              <img src={p.url} alt="Foto pendiente de envío" />
              <span className="thumb-badge">Pendiente</span>
            </div>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <CaptureButton onBlobs={onCapture} />
      <p className="hint">{HINT}</p>

      {open && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Foto">
          {urls[open.public_id] && <img src={urls[open.public_id]} alt="Foto ampliada" />}
          <p className="lightbox-meta">{formatDate(open.created_at)}</p>
          <div className="lightbox-actions">
            <button type="button" className="btn secondary" onClick={() => setOpen(null)}>
              Cerrar
            </button>
            {confirm ? (
              <button type="button" className="btn danger" onClick={remove}>
                Sí, eliminar para siempre
              </button>
            ) : (
              <button type="button" className="btn ghost" onClick={() => setConfirm(true)}>
                Eliminar foto
              </button>
            )}
          </div>
          {confirm && <p className="lightbox-meta">Se borra la imagen. El historial conserva que existió una foto.</p>}
        </div>
      )}
    </section>
  );
}
