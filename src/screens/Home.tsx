import { Link } from "react-router-dom";
import { isConfigured } from "../settings";

export function Home() {
  const configured = isConfigured();
  return (
    <>
      {!configured && (
        <section className="card warn">
          <h2>Falta configurar la estación</h2>
          <p>Cargá la dirección del servidor y la clave de esta estación para empezar.</p>
          <Link className="btn" to="/ajustes">
            Ir a ajustes
          </Link>
        </section>
      )}
      <nav className="menu">
        <Link className="tile" to="/ingreso">
          <strong>Ingreso</strong>
          <span>Recibir un lote y etiquetar equipos</span>
        </Link>
        <Link className="tile" to="/equipo">
          <strong>Equipo</strong>
          <span>Escanear: probar, borrar, desarmar, donar</span>
        </Link>
        <Link className="tile" to="/lote">
          <strong>Lote y balance</strong>
          <span>Registrar scrap por material y ver si cierran los kilos</span>
        </Link>
        <Link className="tile" to="/ajustes">
          <strong>Ajustes y sincronización</strong>
          <span>Estación, conexión y operaciones pendientes</span>
        </Link>
      </nav>
      <p className="hint">
        Prototipo. El flujo está basado en información pública sobre cooperativas de reciclaje electrónico y debe validarse
        en planta antes de usarse en serio.
      </p>
    </>
  );
}
