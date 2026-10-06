import type { Kind, Material, Status } from "./types";

export const STATUS_LABEL: Record<Status, string> = {
  ingresado: "Ingresado",
  funciona: "Funciona",
  falla: "No funciona",
  refuncionalizado: "Refuncionalizado",
  donado: "Donado",
  scrap: "Scrap",
  desarmado: "Desarmado",
  instalado: "Instalado",
};

export const KIND_LABEL: Record<Kind, string> = {
  computadora: "Computadora",
  notebook: "Notebook",
  disco: "Disco",
  ram: "Memoria RAM",
  cpu: "Procesador",
  placa: "Placa",
  monitor: "Monitor",
  impresora: "Impresora",
  otro: "Otro",
};

export const MATERIAL_LABEL: Record<Material, string> = {
  plastico: "Plástico",
  hierro: "Hierro / chapa",
  aluminio: "Aluminio",
  cobre: "Cobre",
  placas: "Placas electrónicas",
  cables: "Cables",
  vidrio: "Vidrio",
  baterias: "Baterías",
  toner: "Tóner / cartuchos",
  otros: "Otros",
};

export const EVENT_LABEL: Record<string, string> = {
  ingreso: "Ingreso",
  ingreso_lote: "Ingreso del lote",
  prueba: "Prueba",
  borrado: "Borrado de datos",
  refuncionalizacion: "Refuncionalización",
  donacion: "Donación",
  scrap: "Enviado a scrap",
  desarme: "Desarme",
  instalacion: "Instalado en otro equipo",
  componente_instalado: "Componente instalado",
  fraccion: "Salida de material",
  foto: "Foto",
  foto_eliminada: "Foto eliminada",
  nota: "Nota",
};

export const KINDS = Object.keys(KIND_LABEL) as Kind[];
export const MATERIALS = Object.keys(MATERIAL_LABEL) as Material[];

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export function kg(n: number): string {
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} kg`;
}
