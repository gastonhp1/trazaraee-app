import { Route, Routes } from "react-router-dom";
import { StatusBar } from "./components/StatusBar";
import { useAutoSync } from "./hooks";
import { AssetScreen } from "./screens/AssetScreen";
import { Home } from "./screens/Home";
import { Intake } from "./screens/Intake";
import { LotScreen } from "./screens/LotScreen";
import { PublicAssetView, PublicLotView } from "./screens/Public";
import { ScanAsset, ScanLot } from "./screens/ScanRoute";
import { Settings } from "./screens/Settings";

export function App() {
  useAutoSync();
  return (
    <>
      <StatusBar />
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/ingreso" element={<Intake />} />
          <Route path="/equipo" element={<ScanAsset />} />
          <Route path="/equipo/:id" element={<AssetScreen />} />
          <Route path="/lote" element={<ScanLot />} />
          <Route path="/lote/:id" element={<LotScreen />} />
          <Route path="/ajustes" element={<Settings />} />
          {/* URLs que codifican los QR */}
          <Route path="/a/:id" element={<PublicAssetView />} />
          <Route path="/l/:id" element={<PublicLotView />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </>
  );
}
