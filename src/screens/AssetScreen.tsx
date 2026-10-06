import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { availability, predictStatus } from "../actions";
import { cacheAsset, cachedAsset } from "../cache";
import { Field, Queued } from "../components/Notice";
import { PrintLabels, QrLabel, type LabelData } from "../components/QrLabel";
import { Scanner } from "../components/Scanner";
import { api, NetworkError } from "../http";
import { newClientId, newPublicId } from "../ids";
import { EVENT_LABEL, formatDate, KINDS, KIND_LABEL, STATUS_LABEL } from "../labels";
import { sendOrQueue } from "../send";
import type { ApiEvent, Asset, AssetRef, EventType, Genealogy, Kind } from "../types";

type Panel = "borrado" | "venta" | "donacion" | "desarme" | "instalarEn" | "recibir" | "nota" | "etiqueta";

interface Row {
  public_id: string;
  kind: Kind;
  label: string;
  serial: string;
  kg: string;
  has_storage: boolean;
}

const newRow = (): Row => ({ public_id: newPublicId(), kind: "disco", label: "", serial: "", kg: "", has_storage: true });

function parseKg(text: string): number | null {
  const n = Number(text.replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function AssetScreen() {
  const { id = "" } = useParams();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [events, setEvents] = useState<ApiEvent[] | null>(null);
  const [gen, setGen] = useState<Genealogy | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  const [newLabels, setNewLabels] = useState<LabelData[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const a = await api.get<Asset>(`/assets/${id}`);
      await cacheAsset(a);
      setAsset(a);
      setOfflineCopy(false);
      api.get<ApiEvent[]>(`/assets/${id}/events`).then(setEvents).catch(() => setEvents(null));
      api.get<Genealogy>(`/assets/${id}/genealogy`).then(setGen).catch(() => setGen(null));
    } catch (e) {
      if (e instanceof NetworkError) {
        const copy = await cachedAsset(id);
        if (copy) {
          setAsset(copy);
          setOfflineCopy(true);
          setEvents(null);
          setGen(null);
        } else {
          setError("Sin conexión, y este equipo no está guardado en este dispositivo.");
        }
      } else {
        setError(e instanceof Error ? e.message : "No se pudo cargar el equipo");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    const onOnline = () => void load();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [load]);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción");
    } finally {
      setBusy(false);
    }
  }

  async function applyOptimistic(next: Asset) {
    await cacheAsset(next);
    setAsset(next);
    setQueued(true);
  }

  function sendEvent(type: EventType, payload: Record<string, unknown>, description: string) {
    if (!asset) return Promise.resolve();
    return act(async () => {
      const body = { type, payload, client_id: newClientId() };
      const res = await sendOrQueue<ApiEvent>({
        method: "POST",
        path: `/assets/${asset.public_id}/events`,
        body,
        description: `${description} · ${asset.label}`,
      });
      setPanel(null);
      if (res.queued) {
        const p = predictStatus(asset, type, payload);
        await applyOptimistic({ ...asset, status: p.status, wiped: p.wiped });
      } else {
        await load();
      }
    });
  }

  function disassemble(rows: Row[]) {
    if (!asset) return Promise.resolve();
    return act(async () => {
      const components = rows.map((r) => ({
        public_id: r.public_id,
        kind: r.kind,
        label: r.label.trim(),
        serial: r.serial.trim() || null,
        has_storage: r.has_storage || r.kind === "disco",
        weight_kg: r.kg.trim() ? parseKg(r.kg) : null,
      }));
      const res = await sendOrQueue<Asset[]>({
        method: "POST",
        path: `/assets/${asset.public_id}/disassemble`,
        body: { components, client_id: newClientId() },
        description: `Desarme de ${asset.label}`,
      });
      for (const c of components) {
        await cacheAsset({
          ...c,
          serial: c.serial,
          wiped: false,
          status: "ingresado",
          lot_public_id: asset.lot_public_id,
          source_asset_public_id: asset.public_id,
          installed_in_public_id: null,
          created_at: new Date().toISOString(),
        });
      }
      setNewLabels(components.map((c) => ({ kind: "a", id: c.public_id, title: c.label, assetKind: c.kind })));
      setPanel(null);
      if (res.queued) {
        const p = predictStatus(asset, "desarme");
        await applyOptimistic({ ...asset, status: p.status });
      } else {
        await load();
      }
    });
  }

  /** Este activo es un componente y se instala en otro equipo (escaneado). */
  function installInto(targetId: string) {
    if (!asset) return Promise.resolve();
    return act(async () => {
      const res = await sendOrQueue<Asset>({
        method: "POST",
        path: `/assets/${targetId}/install`,
        body: { component_public_id: asset.public_id, client_id: newClientId() },
        description: `Instalar ${asset.label}`,
      });
      setPanel(null);
      if (res.queued) {
        const p = predictStatus(asset, "instalacion");
        await applyOptimistic({ ...asset, status: p.status, installed_in_public_id: targetId });
      } else {
        await load();
      }
    });
  }

  /** Este activo es el equipo y recibe un componente (escaneado). */
  function receive(componentId: string) {
    if (!asset) return Promise.resolve();
    return act(async () => {
      const res = await sendOrQueue<Asset>({
        method: "POST",
        path: `/assets/${asset.public_id}/install`,
        body: { component_public_id: componentId, client_id: newClientId() },
        description: `Instalar componente en ${asset.label}`,
      });
      setPanel(null);
      if (res.queued) setQueued(true);
      else await load();
    });
  }

  if (loading && !asset) return <p className="hint">Cargando…</p>;
  if (!asset) {
    return (
      <section className="card warn">
        <h2>No se pudo abrir el equipo</h2>
        <p className="error">{error}</p>
        <Link className="btn secondary" to="/equipo">
          Escanear otro
        </Link>
      </section>
    );
  }

  const av = availability(asset);
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  return (
    <>
      <section className="card">
        <p className="hint">{KIND_LABEL[asset.kind]}</p>
        <h1>{asset.label}</h1>
        <div className="chips">
          <span className={`chip status-${asset.status}`}>{STATUS_LABEL[asset.status]}</span>
          {asset.has_storage &&
            asset.status !== "desarmado" &&
            (asset.wiped ? <span className="chip good">Datos borrados</span> : <span className="chip bad">Falta borrado de datos</span>)}
        </div>
        <p className="hint">
          <Link to={`/lote/${asset.lot_public_id}`}>Ver lote</Link>
          {asset.source_asset_public_id && (
            <>
              {" · "}Salió del equipo <Link to={`/equipo/${asset.source_asset_public_id}`}>{asset.source_asset_public_id}</Link>
            </>
          )}
          {asset.installed_in_public_id && (
            <>
              {" · "}Instalado en <Link to={`/equipo/${asset.installed_in_public_id}`}>{asset.installed_in_public_id}</Link>
            </>
          )}
        </p>
        {offlineCopy && (
          <p className="notice">
            Estás viendo la copia guardada en este dispositivo. Puede no reflejar lo último que se hizo en otras estaciones.
          </p>
        )}
        {queued && <Queued />}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2>¿Qué hacemos?</h2>
        <div className="actions">
          {av.prueba && (
            <>
              <button className="btn big good" disabled={busy} onClick={() => sendEvent("prueba", { result: "ok" }, "Prueba: anda")}>
                Anda
              </button>
              <button className="btn big bad" disabled={busy} onClick={() => sendEvent("prueba", { result: "falla" }, "Prueba: no anda")}>
                No anda
              </button>
            </>
          )}
          {av.borrado && (
            <button className="btn" onClick={() => toggle("borrado")}>
              Registrar borrado de datos
            </button>
          )}
          {av.refuncionalizacion && (
            <button className="btn" disabled={busy} onClick={() => sendEvent("refuncionalizacion", {}, "Refuncionalizado")}>
              Marcar como refuncionalizado
            </button>
          )}
          {av.venta && (
            <button className="btn" onClick={() => toggle("venta")}>
              Venta
            </button>
          )}
          {av.donacion && (
            <button className="btn" onClick={() => toggle("donacion")}>
              Donación
            </button>
          )}
          {av.recibirComponente && (
            <button className="btn secondary" onClick={() => toggle("recibir")}>
              Instalarle un componente
            </button>
          )}
          {av.instalarEn && (
            <button className="btn secondary" onClick={() => toggle("instalarEn")}>
              Instalar este componente en otro equipo
            </button>
          )}
          {av.desarme && (
            <button className="btn secondary" onClick={() => toggle("desarme")}>
              Desarmar
            </button>
          )}
          {av.scrap && (
            <button className="btn danger" disabled={busy} onClick={() => sendEvent("scrap", {}, "Enviado a scrap")}>
              Enviar a scrap
            </button>
          )}
          <button className="btn ghost" onClick={() => toggle("nota")}>
            Agregar nota
          </button>
          <button className="btn ghost" onClick={() => toggle("etiqueta")}>
            Ver etiqueta
          </button>
        </div>
        {av.bloqueadoPorBorrado && (
          <p className="notice">
            Este equipo tiene almacenamiento: antes de refuncionalizarlo, venderlo, donarlo o instalarlo hay que registrar un borrado de datos
            exitoso.
          </p>
        )}
      </section>

      {panel === "borrado" && <WipeForm busy={busy} onSubmit={(p) => sendEvent("borrado", p, "Borrado de datos")} />}
      {panel === "venta" && <RecipientForm title="Venta" busy={busy} onSubmit={(d) => sendEvent("venta", { destinatario: d }, "Venta")} />}
      {panel === "donacion" && (
        <RecipientForm title="Donación" busy={busy} onSubmit={(d) => sendEvent("donacion", { destinatario: d }, "Donación")} />
      )}
      {panel === "nota" && <NoteForm busy={busy} onSubmit={(t) => sendEvent("nota", { text: t }, "Nota")} />}
      {panel === "desarme" && <DisassembleForm busy={busy} onSubmit={disassemble} />}
      {panel === "instalarEn" && (
        <Scanner prompt="Escaneá el equipo donde se instala" expect="a" onScan={(s) => void installInto(s.id)} />
      )}
      {panel === "recibir" && <Scanner prompt="Escaneá el componente a instalar" expect="a" onScan={(s) => void receive(s.id)} />}
      {panel === "etiqueta" && (
        <section className="card">
          <h2>Etiqueta</h2>
          <div className="print-area">
            <QrLabel data={{ kind: "a", id: asset.public_id, title: asset.label, assetKind: asset.kind }} />
          </div>
          <button className="btn" onClick={() => window.print()}>
            Imprimir
          </button>
        </section>
      )}

      <PrintLabels labels={newLabels} />

      {gen && <GenealogyCard gen={gen} />}

      {events && (
        <section className="card">
          <h2>Historial</h2>
          <ol className="timeline">
            {events.map((e) => (
              <li key={e.id}>
                <strong>{EVENT_LABEL[e.type] ?? e.type}</strong>
                <small>
                  {formatDate(e.created_at)} · {e.station}
                </small>
                <Detail type={e.type} payload={e.payload} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

function Detail({ type, payload }: { type: string; payload: Record<string, unknown> }) {
  const parts: string[] = [];
  if (type === "prueba") parts.push(payload.result === "ok" ? "Anda" : "No anda");
  if (type === "borrado") {
    parts.push(String(payload.method ?? ""));
    parts.push(payload.result === "ok" ? "exitoso" : "falló");
  }
  if ((type === "venta" || type === "donacion") && payload.destinatario) parts.push(`a ${String(payload.destinatario)}`);
  if (type === "nota" && payload.text) parts.push(String(payload.text));
  const text = parts.filter(Boolean).join(" · ");
  return text ? <span className="detail">{text}</span> : null;
}

function RefList({ title, items }: { title: string; items: AssetRef[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <h3>{title}</h3>
      <ul className="list">
        {items.map((r) => (
          <li key={r.public_id}>
            <Link to={`/equipo/${r.public_id}`}>
              {KIND_LABEL[r.kind]} · {r.label}
            </Link>{" "}
            <small>{STATUS_LABEL[r.status]}</small>
          </li>
        ))}
      </ul>
    </>
  );
}

function GenealogyCard({ gen }: { gen: Genealogy }) {
  const any = gen.ancestors.length + gen.harvested_components.length + gen.installed_components.length > 0 || gen.installed_in;
  if (!any) return null;
  return (
    <section className="card">
      <h2>Genealogía</h2>
      <RefList title="Salió de" items={gen.ancestors} />
      <RefList title="Instalado en" items={gen.installed_in ? [gen.installed_in] : []} />
      <RefList title="Componentes extraídos al desarmarlo" items={gen.harvested_components} />
      <RefList title="Componentes instalados" items={gen.installed_components} />
    </section>
  );
}

function WipeForm({ busy, onSubmit }: { busy: boolean; onSubmit: (p: Record<string, unknown>) => void }) {
  const [method, setMethod] = useState("nwipe");
  const [result, setResult] = useState<"ok" | "falla">("ok");
  const [disk, setDisk] = useState("");
  return (
    <section className="card">
      <h2>Borrado de datos</h2>
      <Field label="Método / herramienta">
        <input value={method} onChange={(e) => setMethod(e.target.value)} list="wipe-methods" />
        <datalist id="wipe-methods">
          <option value="nwipe" />
          <option value="ShredOS (nwipe)" />
          <option value="ATA Secure Erase" />
          <option value="NVMe Format / Sanitize" />
          <option value="Destrucción física" />
        </datalist>
      </Field>
      <Field label="Serie del disco (opcional)">
        <input value={disk} onChange={(e) => setDisk(e.target.value)} autoCapitalize="characters" />
      </Field>
      <div className="row">
        <label className="check">
          <input type="radio" checked={result === "ok"} onChange={() => setResult("ok")} /> Exitoso
        </label>
        <label className="check">
          <input type="radio" checked={result === "falla"} onChange={() => setResult("falla")} /> Falló
        </label>
      </div>
      <button
        className="btn big"
        disabled={busy || !method.trim()}
        onClick={() => onSubmit({ method: method.trim(), result, ...(disk.trim() ? { disk_serial: disk.trim() } : {}) })}
      >
        Guardar borrado
      </button>
    </section>
  );
}

function RecipientForm({ title, busy, onSubmit }: { title: string; busy: boolean; onSubmit: (d: string) => void }) {
  const [who, setWho] = useState("");
  return (
    <section className="card">
      <h2>{title}</h2>
      <Field label={title === "Venta" ? "Comprador" : "Institución o persona que recibe"}>
        <input value={who} onChange={(e) => setWho(e.target.value)} />
      </Field>
      <p className="hint">Este dato lo ve sólo el personal de la cooperativa, no quien escanee el QR.</p>
      <button className="btn big" disabled={busy || !who.trim()} onClick={() => onSubmit(who.trim())}>
        Confirmar
      </button>
    </section>
  );
}

function NoteForm({ busy, onSubmit }: { busy: boolean; onSubmit: (t: string) => void }) {
  const [text, setText] = useState("");
  return (
    <section className="card">
      <h2>Nota</h2>
      <Field label="Texto">
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <button className="btn" disabled={busy || !text.trim()} onClick={() => onSubmit(text.trim())}>
        Guardar nota
      </button>
    </section>
  );
}

function DisassembleForm({ busy, onSubmit }: { busy: boolean; onSubmit: (rows: Row[]) => void }) {
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [error, setError] = useState<string | null>(null);
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function submit() {
    if (rows.some((r) => !r.label.trim())) {
      setError("Cada componente necesita una descripción.");
      return;
    }
    if (rows.some((r) => r.kg.trim() && parseKg(r.kg) === null)) {
      setError("Revisá los pesos: tienen que ser números.");
      return;
    }
    setError(null);
    onSubmit(rows);
  }

  return (
    <section className="card">
      <h2>Desarme</h2>
      <p className="hint">
        Cargá los componentes que valen la pena seguir (discos, RAM, procesadores…). Cada uno recibe su etiqueta y queda vinculado a este equipo.
        El material que sale como scrap se registra después, por lote.
      </p>
      {rows.map((r, i) => (
        <div className="subcard" key={r.public_id}>
          <Field label="Tipo">
            <select
              value={r.kind}
              onChange={(e) => {
                const kind = e.target.value as Kind;
                update(i, { kind, has_storage: kind === "disco" });
              }}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Descripción">
            <input value={r.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="HDD 500 GB" />
          </Field>
          <div className="row">
            <Field label="Serie (opcional)">
              <input value={r.serial} onChange={(e) => update(i, { serial: e.target.value })} autoCapitalize="characters" />
            </Field>
            <Field label="Peso kg (opcional)">
              <input value={r.kg} onChange={(e) => update(i, { kg: e.target.value })} inputMode="decimal" />
            </Field>
          </div>
          {rows.length > 1 && (
            <button className="btn ghost small" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
              Quitar
            </button>
          )}
        </div>
      ))}
      <button className="btn secondary" onClick={() => setRows((rs) => [...rs, newRow()])}>
        + Otro componente
      </button>
      {error && <p className="error">{error}</p>}
      <button className="btn big" disabled={busy} onClick={submit}>
        Confirmar desarme y generar etiquetas
      </button>
    </section>
  );
}
