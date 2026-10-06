import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../http";
import { EVENT_LABEL, formatDate, KIND_LABEL, kg, STATUS_LABEL } from "../labels";
import { isConfigured } from "../settings";
import type { PublicAsset, PublicLot } from "../types";

function useFetch<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .public<T>(path)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? "Este código no existe." : "No se pudo consultar. Probá de nuevo con conexión."));
  }, [path]);
  return { data, error };
}

function Verified({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="chip good">Historial verificado</span>
  ) : (
    <span className="chip bad">La verificación del historial falló</span>
  );
}

/** Lo que ve cualquier persona al escanear el QR. Sin serial, sin destinatarios, sin personas. */
export function PublicAssetView() {
  const { id = "" } = useParams();
  const { data, error } = useFetch<PublicAsset>(`/public/a/${id}`);
  if (error) return <section className="card warn"><p className="error">{error}</p></section>;
  if (!data) return <p className="hint">Cargando…</p>;
  const visible = data.timeline.filter((t) => t.type !== "ingreso_lote");
  return (
    <>
      <section className="card">
        <p className="hint">{KIND_LABEL[data.kind]} recuperado</p>
        <h1>{data.label}</h1>
        <div className="chips">
          <span className={`chip status-${data.status}`}>{STATUS_LABEL[data.status]}</span>
          {data.data_wipe_certified && <span className="chip good">Datos borrados</span>}
          <Verified ok={data.chain_verified} />
        </div>
        <p>
          Origen: <strong>{data.origin}</strong>
          <br />
          Recibido el {formatDate(data.received_at)}
        </p>
        {isConfigured() && (
          <Link className="btn secondary small" to={`/equipo/${data.public_id}`}>
            Abrir en modo trabajo
          </Link>
        )}
      </section>
      <section className="card">
        <h2>Recorrido</h2>
        <ol className="timeline">
          {visible.map((t, i) => (
            <li key={i}>
              <strong>{EVENT_LABEL[t.type] ?? t.type}</strong>
              <small>{formatDate(t.at)}</small>
            </li>
          ))}
        </ol>
        <p className="hint">
          Este equipo fue recuperado dentro de un esquema de economía circular. Por privacidad, acá no se muestran números de serie ni a quién
          se entregó.
        </p>
      </section>
    </>
  );
}

export function PublicLotView() {
  const { id = "" } = useParams();
  const { data, error } = useFetch<PublicLot>(`/public/l/${id}`);
  if (error) return <section className="card warn"><p className="error">{error}</p></section>;
  if (!data) return <p className="hint">Cargando…</p>;
  return (
    <>
      <section className="card">
        <p className="hint">Lote de residuos electrónicos</p>
        <h1>{data.origin}</h1>
        <p>
          Recibido el {formatDate(data.received_at)} · {kg(data.entered_kg)}
        </p>
        <Verified ok={data.chain_verified} />
        {isConfigured() && (
          <p>
            <Link className="btn secondary small" to={`/lote/${data.public_id}`}>
              Abrir en modo trabajo
            </Link>
          </p>
        )}
      </section>
      <section className="card">
        <h2>Destino de los materiales</h2>
        <table className="table">
          <tbody>
            <tr>
              <td>Reutilizado (equipos y componentes)</td>
              <td>{kg(data.reuse_kg)}</td>
            </tr>
            <tr>
              <td>Reciclado / valorizado</td>
              <td>{kg(data.recycled_kg)}</td>
            </tr>
            <tr>
              <td>Disposición final</td>
              <td>{kg(data.final_disposal_kg)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  );
}
