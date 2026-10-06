import type { Asset, EventType, Status } from "./types";

// Espejo de la máquina de estados del backend (app/rules.py). Sirve para mostrar sólo las
// acciones válidas y para predecir el estado cuando una operación queda en la cola offline.
// La fuente de verdad es el servidor: si discrepan, el servidor rechaza y la cola lo informa.

const TERMINAL: ReadonlySet<Status> = new Set(["vendido", "donado", "scrap", "desarmado", "instalado"]);

export interface Availability {
  prueba: boolean;
  borrado: boolean;
  refuncionalizacion: boolean;
  venta: boolean;
  donacion: boolean;
  desarme: boolean;
  scrap: boolean;
  /** Este activo (como componente) puede instalarse en otro equipo. */
  instalarEn: boolean;
  /** Este activo (como equipo) puede recibir un componente. */
  recibirComponente: boolean;
  /** Habría acciones disponibles, pero falta el certificado de borrado. */
  bloqueadoPorBorrado: boolean;
}

export function availability(a: Asset): Availability {
  const terminal = TERMINAL.has(a.status);
  const wipeOk = !a.has_storage || a.wiped;
  const works = a.status === "funciona";
  const refurb = a.status === "refuncionalizado";
  return {
    prueba: ["ingresado", "funciona", "falla"].includes(a.status),
    borrado: !terminal && a.has_storage,
    refuncionalizacion: works && wipeOk,
    venta: (works || refurb) && wipeOk,
    donacion: (works || refurb) && wipeOk,
    desarme: a.status === "funciona" || a.status === "falla",
    scrap: a.status === "falla",
    instalarEn: works && wipeOk,
    recibirComponente: works || refurb,
    bloqueadoPorBorrado: (works || refurb) && !wipeOk,
  };
}

export function predictStatus(
  a: Asset,
  type: EventType | "desarme" | "instalacion",
  payload: Record<string, unknown> = {},
): { status: Status; wiped: boolean } {
  let status = a.status;
  let wiped = a.wiped;
  switch (type) {
    case "prueba":
      status = payload.result === "ok" ? "funciona" : "falla";
      break;
    case "borrado":
      if (payload.result === "ok") wiped = true;
      break;
    case "refuncionalizacion":
      status = "refuncionalizado";
      break;
    case "venta":
      status = "vendido";
      break;
    case "donacion":
      status = "donado";
      break;
    case "scrap":
      status = "scrap";
      break;
    case "desarme":
      status = "desarmado";
      break;
    case "instalacion":
      status = "instalado";
      break;
    case "nota":
      break;
  }
  return { status, wiped };
}
