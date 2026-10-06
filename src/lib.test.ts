import { describe, expect, it } from "vitest";
import { availability, predictStatus } from "./actions";
import { PUBLIC_ID_RE, newClientId, newPublicId } from "./ids";
import { parseScan } from "./scan";
import type { Asset } from "./types";

const base: Asset = {
  public_id: "abcdefghij234",
  kind: "computadora",
  label: "PC",
  serial: null,
  has_storage: false,
  wiped: false,
  weight_kg: 5,
  status: "ingresado",
  lot_public_id: "lotlotlotlot2",
  source_asset_public_id: null,
  installed_in_public_id: null,
  created_at: "2026-10-05T00:00:00Z",
};

describe("ids", () => {
  it("genera IDs con el formato que acepta el backend, y sin repetirse", () => {
    const ids = new Set(Array.from({ length: 500 }, newPublicId));
    expect(ids.size).toBe(500);
    for (const id of ids) {
      expect(id).toMatch(PUBLIC_ID_RE);
      expect(id).toHaveLength(13);
    }
    expect(newClientId().length).toBeGreaterThan(16);
  });
});

describe("parseScan", () => {
  it("lee la URL del QR de activo y de lote", () => {
    expect(parseScan("https://trazas.test/a/abcdefghij234")).toEqual({ kind: "a", id: "abcdefghij234" });
    expect(parseScan("https://trazas.test/l/ABCDEFGHIJ234/")).toEqual({ kind: "l", id: "abcdefghij234" });
  });
  it("acepta el ID pelado y rechaza basura", () => {
    expect(parseScan("  abcdefghij234 ")).toEqual({ kind: null, id: "abcdefghij234" });
    expect(parseScan("hola")).toBeNull();
    expect(parseScan("https://otro.sitio/producto/123")).toBeNull();
  });
});

describe("availability (espejo de las reglas del backend)", () => {
  it("un equipo recién ingresado sólo se puede probar", () => {
    const a = availability(base);
    expect(a.prueba).toBe(true);
    expect(a.venta).toBe(false);
    expect(a.desarme).toBe(false);
  });

  it("con almacenamiento sin borrar no se puede vender ni instalar", () => {
    const a = availability({ ...base, status: "funciona", has_storage: true });
    expect(a.venta).toBe(false);
    expect(a.instalarEn).toBe(false);
    expect(a.borrado).toBe(true);
    expect(a.bloqueadoPorBorrado).toBe(true);
    const ok = availability({ ...base, status: "funciona", has_storage: true, wiped: true });
    expect(ok.venta && ok.donacion && ok.instalarEn && ok.refuncionalizacion).toBe(true);
    expect(ok.bloqueadoPorBorrado).toBe(false);
  });

  it("scrap sólo desde 'no funciona' y los estados finales no admiten nada", () => {
    expect(availability({ ...base, status: "falla" }).scrap).toBe(true);
    expect(availability({ ...base, status: "funciona" }).scrap).toBe(false);
    const done = availability({ ...base, status: "vendido", has_storage: true });
    expect(Object.values({ ...done, bloqueadoPorBorrado: false }).some(Boolean)).toBe(false);
  });
});

describe("predictStatus", () => {
  it("anticipa el estado de operaciones en cola", () => {
    expect(predictStatus(base, "prueba", { result: "ok" }).status).toBe("funciona");
    expect(predictStatus(base, "prueba", { result: "falla" }).status).toBe("falla");
    expect(predictStatus({ ...base, has_storage: true }, "borrado", { result: "ok" }).wiped).toBe(true);
    expect(predictStatus({ ...base, has_storage: true }, "borrado", { result: "falla" }).wiped).toBe(false);
    expect(predictStatus({ ...base, status: "funciona" }, "donacion", {}).status).toBe("donado");
    expect(predictStatus({ ...base, status: "falla" }, "desarme").status).toBe("desarmado");
  });
});
