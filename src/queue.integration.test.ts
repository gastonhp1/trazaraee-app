// @vitest-environment jsdom
//
// Prueba de integración de la cola offline contra una API real. Se omite si no hay servidor:
//   API_URL=http://localhost:8000 STATION_KEY=tr_... npm test
import "fake-indexeddb/auto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { request } from "./http";
import { newClientId, newPublicId } from "./ids";
import { discardFailed, flushQueue, listFailed, listQueue } from "./queue";
import { sendOrQueue } from "./send";
import type { Asset } from "./types";

const API_URL = process.env.API_URL;
const STATION_KEY = process.env.STATION_KEY;
const run = API_URL && STATION_KEY ? describe : describe.skip;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

function useServer(url: string) {
  localStorage.setItem("trazaraee.settings", JSON.stringify({ apiUrl: url, stationKey: STATION_KEY }));
}

async function drain() {
  await flushQueue();
  for (const f of await listFailed()) await discardFailed(f.id);
}

run("cola offline contra la API real", () => {
  beforeAll(() => useServer(API_URL!));
  beforeEach(async () => {
    useServer(API_URL!);
    setOnline(true);
    await drain();
  });

  it("guarda sin conexión y sincroniza en orden al volver (lote → equipo → prueba)", async () => {
    const lot = newPublicId();
    const asset = newPublicId();
    setOnline(false);

    const r1 = await sendOrQueue({
      method: "POST",
      path: "/lots",
      body: { public_id: lot, client_id: newClientId(), generator_name: "Offline SA", weight_kg: 20 },
      description: "Lote offline",
    });
    const r2 = await sendOrQueue({
      method: "POST",
      path: "/assets",
      body: { public_id: asset, lot_public_id: lot, kind: "notebook", label: "Notebook offline", has_storage: true, weight_kg: 2 },
      description: "Equipo offline",
    });
    const r3 = await sendOrQueue({
      method: "POST",
      path: `/assets/${asset}/events`,
      body: { type: "prueba", payload: { result: "ok" }, client_id: newClientId() },
      description: "Prueba offline",
    });
    expect([r1.queued, r2.queued, r3.queued]).toEqual([true, true, true]);
    expect(await listQueue()).toHaveLength(3);

    setOnline(true);
    const res = await flushQueue();
    expect(res).toEqual({ sent: 3, failed: 0, remaining: 0 });

    const got = await request<Asset>("GET", `/assets/${asset}`);
    expect(got.status).toBe("funciona");
    expect(got.lot_public_id).toBe(lot);
  });

  it("no duplica operaciones: la misma operación encolada dos veces se envía una sola vez", async () => {
    const lot = newPublicId();
    const body = { public_id: lot, client_id: newClientId(), generator_name: "Dup SA", weight_kg: 5 };
    setOnline(false);
    await sendOrQueue({ method: "POST", path: "/lots", body, description: "Lote" });
    await sendOrQueue({ method: "POST", path: "/lots", body, description: "Lote (reintento)" });
    expect(await listQueue()).toHaveLength(1);

    setOnline(true);
    await flushQueue();
    // Reenviar a mano lo mismo (como haría un reintento tras un corte) devuelve el mismo lote.
    const again = await request<{ public_id: string }>("POST", "/lots", body);
    expect(again.public_id).toBe(lot);
  });

  it("las operaciones que el servidor rechaza van a 'rechazadas' y no frenan al resto", async () => {
    const lot = newPublicId();
    const pc = newPublicId();
    await request("POST", "/lots", { public_id: lot, generator_name: "Reglas SA", weight_kg: 10 });
    await request("POST", "/assets", { public_id: pc, lot_public_id: lot, kind: "computadora", label: "PC", has_storage: true });
    await request("POST", `/assets/${pc}/events`, { type: "prueba", payload: { result: "ok" } });

    setOnline(false);
    // Venta sin borrado de datos: el servidor la va a rechazar...
    await sendOrQueue({
      method: "POST",
      path: `/assets/${pc}/events`,
      body: { type: "venta", payload: { destinatario: "X" }, client_id: newClientId() },
      description: "Venta sin borrado",
    });
    // ...pero esta nota, que viene después, tiene que llegar igual.
    await sendOrQueue({
      method: "POST",
      path: `/assets/${pc}/events`,
      body: { type: "nota", payload: { text: "llegó igual" }, client_id: newClientId() },
      description: "Nota",
    });

    setOnline(true);
    const res = await flushQueue();
    expect(res).toEqual({ sent: 1, failed: 1, remaining: 0 });
    const failed = await listFailed();
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toMatch(/borrado/i);
  });

  it("si el servidor no responde, conserva la cola intacta para reintentar", async () => {
    const lot = newPublicId();
    setOnline(false);
    await sendOrQueue({
      method: "POST",
      path: "/lots",
      body: { public_id: lot, client_id: newClientId(), generator_name: "Sin red SA", weight_kg: 1 },
      description: "Lote sin red",
    });

    setOnline(true);
    useServer("http://127.0.0.1:9"); // nadie escucha acá
    const res = await flushQueue();
    expect(res).toEqual({ sent: 0, failed: 0, remaining: 1 });
    expect(await listFailed()).toHaveLength(0);

    useServer(API_URL!);
    expect(await flushQueue()).toEqual({ sent: 1, failed: 0, remaining: 0 });
  });
});
