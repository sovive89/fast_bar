import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

const TENANT = "00000000-0000-4000-8000-000000000001";
const ITEM = "00000000-0000-4000-8000-0000000000a1";
const holder = { db: new FakeSupabase() };
const gate = vi.fn(async () => {});
vi.mock("../src/lib/fastbar.server", () => ({
  admin: () => holder.db,
  getDefaultTenantId: async () => TENANT,
  assertRegisterAccess: () => gate(),
}));
const server = await import("../src/lib/consumables.server");
const rules = await import("../src/lib/consumables");

const seed = (patch: Record<string, unknown> = {}) =>
  holder.db.seed("fastbar_consumables", [
    {
      id: ITEM,
      tenant_id: TENANT,
      name: "Detergente",
      unit: "un",
      current_stock: 10,
      min_stock: 3,
      sector: "cozinha",
      category: "material_consumo",
      active: true,
      ...patch,
    },
  ]);
const stock = () => Number(holder.db.table("fastbar_consumables")[0]!["current_stock"]);

beforeEach(() => {
  holder.db = new FakeSupabase();
  gate.mockReset();
  gate.mockResolvedValue();
});

describe("regras de materiais e utensílios", () => {
  it("valida o cadastro", () => {
    const ok = {
      name: "Copo long drink",
      unit: "un",
      minStock: "24",
      sector: "bar",
      category: "utensilio",
    };
    expect(rules.validateCreate(ok).ok).toBe(true);
    const bad = (patch: Record<string, unknown>) => rules.validateCreate({ ...ok, ...patch }).ok;
    expect(bad({ name: "a" })).toBe(false);
    expect(bad({ unit: "" })).toBe(false);
    expect(bad({ minStock: "-1" })).toBe(false);
    expect(bad({ sector: "lavanderia" })).toBe(false);
    expect(bad({ category: "patrimonio" })).toBe(false);
  });
  it("valida a movimentação e o motivo de cada sentido", () => {
    const ok = { type: "saida", quantity: "2", reason: "quebra" };
    expect(rules.validateAdjust(ok).ok).toBe(true);
    expect(rules.validateAdjust({ ...ok, quantity: "0" }).ok).toBe(false);
    expect(rules.validateAdjust({ ...ok, type: "outro" }).ok).toBe(false);
    expect(rules.validateAdjust({ ...ok, reason: "compra" }).ok).toBe(false); // compra não é baixa
    expect(rules.validateAdjust({ type: "entrada", quantity: 5, reason: "compra" }).ok).toBe(true);
    expect(rules.validateAdjust({ type: "entrada", quantity: 5, reason: "quebra" }).ok).toBe(false);
  });
  it("avisa abaixo do mínimo só quando há mínimo", () => {
    expect(rules.isBelowMinimum({ current_stock: 3, min_stock: 3 })).toBe(true);
    expect(rules.isBelowMinimum({ current_stock: 4, min_stock: 3 })).toBe(false);
    expect(rules.isBelowMinimum({ current_stock: 0, min_stock: 0 })).toBe(false);
  });
});

describe("servidor de materiais e utensílios", () => {
  it("exige acesso da equipe", async () => {
    gate.mockRejectedValueOnce(new Error("Acesso do caixa não autorizado."));
    await expect(server.listConsumables()).rejects.toThrow("não autorizado");
  });

  it("cadastra com setor e tipo", async () => {
    expect(
      await server.createConsumable({
        name: "  Copo   long drink ",
        unit: "un",
        minStock: "24",
        sector: "bar",
        category: "utensilio",
      }),
    ).toEqual({ ok: true });
    expect(holder.db.table("fastbar_consumables")[0]).toMatchObject({
      name: "Copo long drink",
      sector: "bar",
      category: "utensilio",
      min_stock: 24,
    });
    expect((await server.createConsumable({ name: "x" })).ok).toBe(false);
  });

  it("lista só itens ativos e válidos, com setor e tipo", async () => {
    seed();
    holder.db.seed("fastbar_consumables", [
      {
        id: "i2",
        tenant_id: TENANT,
        name: "Velho",
        unit: "un",
        current_stock: 1,
        min_stock: 0,
        sector: "bar",
        category: "utensilio",
        active: false,
      },
    ]);
    const items = await server.listConsumables();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "Detergente",
      sector: "cozinha",
      category: "material_consumo",
    });
  });

  it("entrada soma, baixa subtrai, e cada uma deixa registro com motivo", async () => {
    seed();
    expect(
      (await server.adjustConsumable(ITEM, { type: "entrada", quantity: "5", reason: "compra" }))
        .ok,
    ).toBe(true);
    expect(stock()).toBe(15);
    expect(
      (
        await server.adjustConsumable(ITEM, {
          type: "saida",
          quantity: "2",
          reason: "quebra",
          note: "caiu",
        })
      ).ok,
    ).toBe(true);
    expect(stock()).toBe(13);
    const movements = holder.db.table("fastbar_consumable_movements");
    expect(movements).toHaveLength(2);
    expect(movements[1]).toMatchObject({
      type: "saida",
      quantity: 2,
      reason: "quebra",
      note: "caiu",
    });
  });

  it("não deixa o saldo ficar negativo e não registra movimento", async () => {
    seed({ current_stock: 2 });
    const result = await server.adjustConsumable(ITEM, {
      type: "saida",
      quantity: "3",
      reason: "consumo",
    });
    expect(result.ok).toBe(false);
    expect(stock()).toBe(2);
    expect(holder.db.table("fastbar_consumable_movements")).toHaveLength(0);
  });

  it("duas baixas ao mesmo tempo não perdem nenhuma", async () => {
    seed({ current_stock: 10 });
    const [a, b] = await Promise.all([
      server.adjustConsumable(ITEM, { type: "saida", quantity: "3", reason: "consumo" }),
      server.adjustConsumable(ITEM, { type: "saida", quantity: "4", reason: "consumo" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(stock()).toBe(3);
    expect(holder.db.table("fastbar_consumable_movements")).toHaveLength(2);
  });

  it("sem registrar o movimento, desfaz a mudança de saldo", async () => {
    seed();
    holder.db.failNext.set("fastbar_consumable_movements:insert", "falhou");
    const result = await server.adjustConsumable(ITEM, {
      type: "saida",
      quantity: "2",
      reason: "consumo",
    });
    expect(result.ok).toBe(false);
    expect(stock()).toBe(10);
  });

  it("recusa id inválido e item inexistente", async () => {
    expect(
      (await server.adjustConsumable("bad", { type: "entrada", quantity: 1, reason: "compra" })).ok,
    ).toBe(false);
    expect(
      (await server.adjustConsumable(ITEM, { type: "entrada", quantity: 1, reason: "compra" })).ok,
    ).toBe(false);
  });
});
