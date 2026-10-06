import { useState } from "react";
import { Link } from "react-router-dom";
import { cacheAsset, cacheLot } from "../cache";
import { Field, Queued } from "../components/Notice";
import { PrintLabels, type LabelData } from "../components/QrLabel";
import { newClientId, newPublicId } from "../ids";
import { KINDS, KIND_LABEL, kg } from "../labels";
import { sendOrQueue } from "../send";
import type { Asset, Kind, Lot } from "../types";

const STORAGE_BY_DEFAULT: Kind[] = ["computadora", "notebook", "disco"];

function parseKg(text: string): number | null {
  const n = Number(text.replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function Intake() {
  const [lot, setLot] = useState<Lot | null>(null);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // formulario del lote
  const [generator, setGenerator] = useState("");
  const [lotKg, setLotKg] = useState("");
  const [generatorPublic, setGeneratorPublic] = useState(false);
  const [notes, setNotes] = useState("");

  // formulario de equipo
  const [kind, setKind] = useState<Kind>("computadora");
  const [label, setLabel] = useState("");
  const [serial, setSerial] = useState("");
  const [assetKg, setAssetKg] = useState("");
  const [hasStorage, setHasStorage] = useState(true);
  const [created, setCreated] = useState<Asset[]>([]);
  const [labels, setLabels] = useState<LabelData[]>([]);

  async function createLot() {
    const weight = parseKg(lotKg);
    if (!generator.trim() || weight === null) {
      setError("Indicá el generador y el peso total del lote (en kg).");
      return;
    }
    setBusy(true);
    setError(null);
    const public_id = newPublicId();
    try {
      const body = {
        public_id,
        client_id: newClientId(),
        generator_name: generator.trim(),
        generator_public: generatorPublic,
        weight_kg: weight,
        notes: notes.trim() || null,
      };
      const res = await sendOrQueue<Lot>({ method: "POST", path: "/lots", body, description: `Lote de ${body.generator_name}` });
      const value: Lot = res.queued
        ? {
            public_id,
            generator_name: body.generator_name,
            generator_public: generatorPublic,
            weight_kg: weight,
            notes: body.notes,
            received_at: new Date().toISOString(),
          }
        : res.data;
      await cacheLot(value);
      setLot(value);
      setQueued(res.queued);
      setLabels([{ kind: "l", id: value.public_id, title: `Lote ${value.generator_name}`, subtitle: kg(value.weight_kg) }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el lote");
    } finally {
      setBusy(false);
    }
  }

  async function addAsset() {
    if (!lot) return;
    if (!label.trim()) {
      setError("Poné una descripción corta del equipo (marca y modelo).");
      return;
    }
    const weight = assetKg.trim() ? parseKg(assetKg) : null;
    if (assetKg.trim() && weight === null) {
      setError("El peso del equipo no es válido.");
      return;
    }
    setBusy(true);
    setError(null);
    const public_id = newPublicId();
    try {
      const body = {
        public_id,
        lot_public_id: lot.public_id,
        kind,
        label: label.trim(),
        serial: serial.trim() || null,
        has_storage: hasStorage,
        weight_kg: weight,
      };
      const res = await sendOrQueue<Asset>({
        method: "POST",
        path: "/assets",
        body,
        description: `Equipo ${body.label}`,
      });
      const asset: Asset = res.queued
        ? {
            public_id,
            kind,
            label: body.label,
            serial: body.serial,
            has_storage: hasStorage || kind === "disco",
            wiped: false,
            weight_kg: weight,
            status: "ingresado",
            lot_public_id: lot.public_id,
            source_asset_public_id: null,
            installed_in_public_id: null,
            created_at: new Date().toISOString(),
          }
        : res.data;
      if (res.queued) setQueued(true);
      await cacheAsset(asset);
      setCreated((c) => [asset, ...c]);
      setLabels((l) => [...l, { kind: "a", id: asset.public_id, title: asset.label, assetKind: asset.kind }]);
      setLabel("");
      setSerial("");
      setAssetKg("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el equipo");
    } finally {
      setBusy(false);
    }
  }

  if (!lot) {
    return (
      <section className="card">
        <h2>Nuevo lote</h2>
        <p className="hint">Un lote es todo lo que llega junto de un mismo generador. Se pesa al ingresar.</p>
        <Field label="Generador (empresa, organismo, persona)">
          <input value={generator} onChange={(e) => setGenerator(e.target.value)} />
        </Field>
        <Field label="Peso total (kg)">
          <input value={lotKg} onChange={(e) => setLotKg(e.target.value)} inputMode="decimal" placeholder="120" />
        </Field>
        <label className="check">
          <input type="checkbox" checked={generatorPublic} onChange={(e) => setGeneratorPublic(e.target.checked)} />
          Mostrar el nombre del generador a quien escanee el QR
        </label>
        <p className="hint">Por defecto el generador queda reservado: se ve como “Generador reservado”.</p>
        <Field label="Notas (opcional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p className="error">{error}</p>}
        <button className="btn big" onClick={createLot} disabled={busy}>
          Registrar lote
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="card ok-card">
        <h2>Lote registrado</h2>
        <p>
          <strong>{lot.generator_name}</strong> · {kg(lot.weight_kg)}
        </p>
        {queued && <Queued />}
        <Link className="btn secondary small" to={`/lote/${lot.public_id}`}>
          Ver balance del lote
        </Link>
      </section>

      <section className="card">
        <h2>Etiquetar un equipo</h2>
        <p className="hint">Etiquetá lo que vale la pena seguir uno por uno (computadoras, notebooks, discos). El resto va por lote.</p>
        <Field label="Tipo">
          <select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as Kind;
              setKind(k);
              setHasStorage(STORAGE_BY_DEFAULT.includes(k));
            }}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Descripción (marca y modelo)">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Dell OptiPlex 3020" />
        </Field>
        <Field label="Número de serie (opcional, no sale en la etiqueta)">
          <input value={serial} onChange={(e) => setSerial(e.target.value)} autoCapitalize="characters" />
        </Field>
        <Field label="Peso (kg, opcional)">
          <input value={assetKg} onChange={(e) => setAssetKg(e.target.value)} inputMode="decimal" />
        </Field>
        <label className="check">
          <input type="checkbox" checked={hasStorage || kind === "disco"} disabled={kind === "disco"} onChange={(e) => setHasStorage(e.target.checked)} />
          Tiene almacenamiento (hay que borrar los datos antes de reutilizarlo)
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn big" onClick={addAsset} disabled={busy}>
          Agregar equipo y generar etiqueta
        </button>
      </section>

      {created.length > 0 && (
        <section className="card">
          <h2>Cargados en esta sesión ({created.length})</h2>
          <ul className="list">
            {created.map((a) => (
              <li key={a.public_id}>
                {KIND_LABEL[a.kind]} · {a.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      <PrintLabels labels={labels} />
    </>
  );
}
