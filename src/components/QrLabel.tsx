import qrcode from "qrcode-generator";
import { useMemo } from "react";
import { KIND_LABEL } from "../labels";
import type { Kind } from "../types";

/** URL pública que codifica el QR. Configurable para producción con VITE_PUBLIC_URL. */
function publicBase(): string {
  const configured = import.meta.env.VITE_PUBLIC_URL as string | undefined;
  return (configured || window.location.origin).replace(/\/+$/, "");
}

export function labelUrl(kind: "a" | "l", id: string): string {
  return `${publicBase()}/${kind}/${id}`;
}

export interface LabelData {
  kind: "a" | "l";
  id: string;
  title: string;
  subtitle?: string;
  assetKind?: Kind;
}

/** Etiqueta imprimible (60×30 mm). Se genera en el dispositivo: funciona sin conexión. */
export function QrLabel({ data }: { data: LabelData }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "Q");
    qr.addData(labelUrl(data.kind, data.id));
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }, [data.kind, data.id]);

  return (
    <div className="label">
      <div className="label-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="label-text">
        <strong>{data.title}</strong>
        {data.assetKind && <span>{KIND_LABEL[data.assetKind]}</span>}
        {data.subtitle && <span>{data.subtitle}</span>}
        <code>{data.id}</code>
      </div>
    </div>
  );
}

export function PrintLabels({ labels }: { labels: LabelData[] }) {
  if (labels.length === 0) return null;
  return (
    <section className="card">
      <h2>Etiquetas ({labels.length})</h2>
      <div className="print-area">
        {labels.map((l) => (
          <QrLabel key={`${l.kind}-${l.id}`} data={l} />
        ))}
      </div>
      <button className="btn" onClick={() => window.print()}>
        Imprimir etiquetas
      </button>
      <p className="hint">Usá etiquetas de poliéster o vinilo con adhesivo industrial: el polvo y la grasa despegan el papel común.</p>
    </section>
  );
}
