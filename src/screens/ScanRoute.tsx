import { useNavigate } from "react-router-dom";
import { Scanner } from "../components/Scanner";

export function ScanAsset() {
  const navigate = useNavigate();
  return <Scanner prompt="Escaneá la etiqueta del equipo" expect="a" onScan={(s) => navigate(`/equipo/${s.id}`)} />;
}

export function ScanLot() {
  const navigate = useNavigate();
  return <Scanner prompt="Escaneá la etiqueta del lote" expect="l" onScan={(s) => navigate(`/lote/${s.id}`)} />;
}
