export type Kind = "computadora" | "notebook" | "disco" | "ram" | "cpu" | "placa" | "monitor" | "impresora" | "otro";
export type Status =
  | "ingresado"
  | "funciona"
  | "falla"
  | "refuncionalizado"
  | "vendido"
  | "donado"
  | "scrap"
  | "desarmado"
  | "instalado";
export type Material =
  | "plastico"
  | "hierro"
  | "aluminio"
  | "cobre"
  | "placas"
  | "cables"
  | "vidrio"
  | "baterias"
  | "toner"
  | "otros";
export type EventType =
  | "prueba"
  | "borrado"
  | "refuncionalizacion"
  | "venta"
  | "donacion"
  | "scrap"
  | "nota";

export interface Lot {
  public_id: string;
  generator_name: string;
  generator_public: boolean;
  weight_kg: number;
  notes: string | null;
  received_at: string;
}

export interface Asset {
  public_id: string;
  kind: Kind;
  label: string;
  serial: string | null;
  has_storage: boolean;
  wiped: boolean;
  weight_kg: number | null;
  status: Status;
  lot_public_id: string;
  source_asset_public_id: string | null;
  installed_in_public_id: string | null;
  created_at: string;
}

export interface AssetRef {
  public_id: string;
  kind: Kind;
  label: string;
  status: Status;
}

export interface Genealogy {
  asset: AssetRef;
  ancestors: AssetRef[];
  harvested_components: AssetRef[];
  installed_components: AssetRef[];
  installed_in: AssetRef | null;
}

export interface ApiEvent {
  id: number;
  type: string;
  station: string;
  payload: Record<string, unknown>;
  created_at: string;
  hash: string;
}

export interface Balance {
  entered_kg: number;
  stock_kg: number;
  reuse_kg: number;
  fractions_kg: number;
  unaccounted_kg: number;
  tolerance_kg: number;
  balanced: boolean;
  assets_without_weight: number;
}

export interface Fraction {
  material: Material;
  weight_kg: number;
  destination: string;
  destination_kind: "recicladora" | "disposicion_final";
  created_at: string;
}

export interface PublicAsset {
  public_id: string;
  kind: Kind;
  label: string;
  status: Status;
  origin: string;
  received_at: string;
  data_wipe_certified: boolean;
  chain_verified: boolean;
  timeline: { type: string; at: string }[];
}

export interface PublicLot {
  public_id: string;
  origin: string;
  received_at: string;
  entered_kg: number;
  reuse_kg: number;
  recycled_kg: number;
  final_disposal_kg: number;
  chain_verified: boolean;
}

export interface Station {
  id: number;
  name: string;
}
