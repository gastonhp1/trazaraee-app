import { useEffect, useRef, useState } from "react";
import { parseScan, type Scanned } from "../scan";

// BarcodeDetector todavía no está en los tipos de TypeScript.
interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }
}

interface Props {
  prompt: string;
  /** Si se indica, rechaza los QR de otro tipo (por ejemplo un lote cuando se espera un equipo). */
  expect?: "a" | "l";
  onScan: (s: Scanned) => void;
}

export function Scanner({ prompt, expect, onScan }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;

  function accept(raw: string): boolean {
    const parsed = parseScan(raw);
    if (!parsed) {
      setError("Ese código no es de TrazaRAEE.");
      return false;
    }
    if (expect && parsed.kind && parsed.kind !== expect) {
      setError(expect === "a" ? "Ese QR es de un lote, no de un equipo." : "Ese QR es de un equipo, no de un lote.");
      return false;
    }
    setError(null);
    onScan(parsed);
    return true;
  }

  useEffect(() => {
    if (!cameraOn || !supported) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    const detector = new window.BarcodeDetector!({ formats: ["qr_code"] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            for (const c of codes) {
              if (accept(c.rawValue)) {
                setCameraOn(false);
                return;
              }
            }
          } catch {
            /* frame no listo: se reintenta */
          }
          setTimeout(tick, 250);
        };
        void tick();
      } catch {
        setError("No se pudo abrir la cámara. Revisá el permiso o escribí el código a mano.");
        setCameraOn(false);
      }
    })();

    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn]);

  return (
    <section className="card">
      <h2>{prompt}</h2>
      {supported ? (
        <>
          {cameraOn ? (
            <>
              <video ref={video} className="viewfinder" playsInline muted />
              <button className="btn secondary" onClick={() => setCameraOn(false)}>
                Cerrar cámara
              </button>
            </>
          ) : (
            <button className="btn big" onClick={() => setCameraOn(true)}>
              Escanear QR con la cámara
            </button>
          )}
        </>
      ) : (
        <p className="hint">Este navegador no puede leer QR con la cámara. Escribí el código impreso en la etiqueta.</p>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (accept(manual)) setManual("");
        }}
      >
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Código de la etiqueta"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button className="btn secondary" type="submit">
          Abrir
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
