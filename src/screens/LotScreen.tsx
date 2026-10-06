import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { cacheLot, cachedLot } from "../cache";
import { Field, Queued } from "../components/Notice";
import { PrintLabels } from "../components/QrLabel";
import { api, NetworkError } from "../http";
import { newClientId } from "../ids";
import { formatDate, kg, MATERIAL_LABEL, MATERIALS } from "../labels";
import { listQueue } from "../queue";
import { sendOrQueue } from "../send";
import type { Balance, Fraction, Lot, Material } from "../types";

export function LotScreen() {
  const { id = "" } = useParams();
  const [lot, setLot] = useState<Lot | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [fractions, setFractions] = useState<Fraction[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [local, setLocal] = useState<Fraction[]>([]);

  const [material, setMaterial] = useState<Material>("plastico");
  const [weight, setWeight] = useState("");
  const [destination, setDestination] = useState("");
  const [destKind, setDestKind] = useState<Fraction["destination_kind"]>("recicladora");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const l = await api.get<Lot>(`/lots/${id}`);
      await cacheLot(l);
      setLot(l);
      setOffline(false);
      api.get<Balance>(`/lots/${id}/balance`).then(setBalance).catch(() => setBalance(null));
      api
        .get<Fraction[]>(`/lots/${id}/fractions`)
        .then(async (list) => {
          setFractions(list);
          // Con la cola vacía, lo que se cargó sin conexión ya está en el servidor.
          if ((await listQueue()).length === 0) setLocal([]);
        })
        .catch(() => setFractions(null));
    } catch (e) {
      if (e instanceof NetworkError) {
        const copy = await cachedLot(id);
        if (copy) {
          setLot(copy);
          setOffline(true);
        } else setError("Sin conexión, y este lote no está guardado en este dispositivo.");
      } else setError(e instanceof Error ? e.message : "No se pudo cargar el lote");
    }
  }, [id]);

  useEffect(() => {
    void load();
    const onOnline = () => void load();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [load]);

  async function addFraction() {
    const n = Number(weight.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0 || !destination.trim()) {
      setError("Indicá peso (kg) y a quién se entrega.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        material,
        weight_kg: n,
        destination: destination.trim(),
        destination_kind: destKind,
        client_id: newClientId(),
      };
      const res = await sendOrQueue<Fraction>({
        method: "POST",
        path: `/lots/${id}/fractions`,
        body,
        description: `${MATERIAL_LABEL[material]} ${n} kg`,
      });
      if (res.queued) {
        setQueued(true);
        setLocal((l) => [...l, { ...body, created_at: new Date().toISOString() }]);
      } else {
        await load();
      }
      setWeight("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setBusy(false);
    }
  }

  if (!lot) {
    return (
      <section className="card warn">
        <h2>No se pudo abrir el lote</h2>
        <p className="error">{error ?? "Cargando…"}</p>
        <Link className="btn secondary" to="/lote">
          Escanear otro
        </Link>
      </section>
    );
  }

  return (
    <>
      <section className="card">
        <p className="hint">Lote · {formatDate(lot.received_at)}</p>
        <h1>{lot.generator_name}</h1>
        <p>{kg(lot.weight_kg)} ingresados</p>
        <p className="hint">
          {lot.generator_public ? "El generador se muestra al escanear el QR." : "El generador queda reservado al escanear el QR."}
        </p>
        {offline && <p className="notice">Copia guardada en este dispositivo: el balance se calcula con conexión.</p>}
      </section>

      {balance && (
        <section className={`card ${balance.balanced ? "ok-card" : "warn"}`}>
          <h2>Balance de masas</h2>
          <table className="table">
            <tbody>
              <tr>
                <td>Ingresado</td>
                <td>{kg(balance.entered_kg)}</td>
              </tr>
              <tr>
                <td>En planta (equipos y componentes)</td>
                <td>{kg(balance.stock_kg)}</td>
              </tr>
              <tr>
                <td>Reutilizado (venta, donación, instalado)</td>
                <td>{kg(balance.reuse_kg)}</td>
              </tr>
              <tr>
                <td>Salió como material</td>
                <td>{kg(balance.fractions_kg)}</td>
              </tr>
              <tr className="total">
                <td>Sin explicar</td>
                <td>{kg(balance.unaccounted_kg)}</td>
              </tr>
            </tbody>
          </table>
          <p className={balance.balanced ? "ok" : "error"}>
            {balance.balanced
              ? `Cierra (tolerancia ${kg(balance.tolerance_kg)}).`
              : `No cierra: hay ${kg(Math.abs(balance.unaccounted_kg))} ${balance.unaccounted_kg > 0 ? "sin registrar" : "de más"} (tolerancia ${kg(balance.tolerance_kg)}).`}
          </p>
          {balance.assets_without_weight > 0 && (
            <p className="hint">{balance.assets_without_weight} equipos no tienen peso cargado, por eso el balance puede estar incompleto.</p>
          )}
          <p className="hint">Al desarmar o descartar un equipo, su peso tiene que reaparecer como componentes y como material.</p>
        </section>
      )}

      <section className="card">
        <h2>Registrar salida de material</h2>
        <Field label="Material">
          <select value={material} onChange={(e) => setMaterial(e.target.value as Material)}>
            {MATERIALS.map((m) => (
              <option key={m} value={m}>
                {MATERIAL_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Peso (kg)">
          <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Se entrega a">
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Recicladora / operador" />
        </Field>
        <Field label="Tipo de destino">
          <select value={destKind} onChange={(e) => setDestKind(e.target.value as Fraction["destination_kind"])}>
            <option value="recicladora">Reciclado / valorización</option>
            <option value="disposicion_final">Disposición final</option>
          </select>
        </Field>
        {queued && <Queued />}
        {error && <p className="error">{error}</p>}
        <button className="btn big" onClick={addFraction} disabled={busy}>
          Registrar salida
        </button>
      </section>

      {(fractions?.length || local.length) ? (
        <section className="card">
          <h2>Salidas registradas</h2>
          <ul className="list">
            {[...(fractions ?? []), ...local].map((f, i) => (
              <li key={i}>
                {MATERIAL_LABEL[f.material]} · {kg(f.weight_kg)} → {f.destination}{" "}
                <small>{f.destination_kind === "disposicion_final" ? "disposición final" : "reciclado"}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PrintLabels labels={[{ kind: "l", id: lot.public_id, title: `Lote ${lot.generator_name}`, subtitle: kg(lot.weight_kg) }]} />
    </>
  );
}
