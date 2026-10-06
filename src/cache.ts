import { get, set } from "idb-keyval";
import type { Asset, Lot } from "./types";

// Copia local de lo último que se vio o creó en este dispositivo, para poder seguir
// trabajando sin conexión (el estado puede estar anticipado: ver actions.predictStatus).

export const cacheAsset = (a: Asset) => set(`asset:${a.public_id}`, a);
export const cachedAsset = (id: string) => get<Asset>(`asset:${id}`);
export const cacheLot = (l: Lot) => set(`lot:${l.public_id}`, l);
export const cachedLot = (id: string) => get<Lot>(`lot:${id}`);
