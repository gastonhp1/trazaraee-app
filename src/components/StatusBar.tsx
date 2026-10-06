import { Link } from "react-router-dom";
import { useOnline, useQueueStatus } from "../hooks";

export function StatusBar() {
  const online = useOnline();
  const { pending, failed } = useQueueStatus();
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        TrazaRAEE
      </Link>
      <Link to="/ajustes" className="sync" aria-label="Estado de sincronización">
        <span className={`dot ${online ? "on" : "off"}`} />
        {online ? "En línea" : "Sin conexión"}
        {pending > 0 && <span className="badge">{pending} pendientes</span>}
        {failed > 0 && <span className="badge danger">{failed} rechazadas</span>}
      </Link>
    </header>
  );
}
