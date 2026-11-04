import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

const holder: { db: FakeSupabase } = { db: new FakeSupabase() };
vi.mock("../src/lib/fastbar.server", () => ({ admin: () => holder.db }));

const {
  validateRecipeInput,
  expectedYield,
  createProducedItemWithRecipe,
  registerProductionOrder,
} = await import("../src/lib/production.server");

const base = {
  name: "Xarope de limão",
  unit: "ml",
  yieldQuantity: 1500,
  lossPercent: 10,
  components: [
    { kind: "ingredient" as const, id: "limao", quantity: 1000 },
    { kind: "ingredient" as const, id: "acucar", quantity: 800 },
  ],
};

beforeEach(() => {
  holder.db = new FakeSupabase();
});

describe("validação da ficha", () => {
  it("aceita uma ficha completa e normaliza o texto", () => {
    const result = validateRecipeInput({ ...base, name: "  Xarope  " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe("Xarope");
  });

  it("recusa o que está faltando ou errado, dizendo o quê", () => {
    const cases: Array<[Partial<typeof base>, RegExp]> = [
      [{ name: " " }, /nome/i],
      [{ unit: "" }, /unidade/i],
      [{ yieldQuantity: 0 }, /rendimento/i],
      [{ lossPercent: 100 }, /perda/i],
      [{ lossPercent: -1 }, /perda/i],
      [{ components: [] }, /ingrediente/i],
      [{ components: [{ kind: "ingredient", id: "x", quantity: 0 }] }, /quantidade/i],
      [
        {
          components: [
            { kind: "ingredient", id: "x", quantity: 1 },
            { kind: "ingredient", id: "x", quantity: 2 },
          ],
        },
        /duas vezes/i,
      ],
    ];
    for (const [patch, pattern] of cases) {
      const result = validateRecipeInput({ ...base, ...patch });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(pattern);
    }
  });

  it("o mesmo id em tipos diferentes não é duplicado", () => {
    const result = validateRecipeInput({
      ...base,
      components: [
        { kind: "ingredient", id: "x", quantity: 1 },
        { kind: "base_drink", id: "x", quantity: 1 },
      ],
    });
    expect(result.ok).toBe(true);
  });
});

describe("prévia do rendimento", () => {
  it("desconta a perda prevista e multiplica pelas receitas", () => {
    expect(expectedYield(1500, 10)).toBe(1350);
    expect(expectedYield(1500, 10, 2)).toBe(2700);
    expect(expectedYield(1000, 0)).toBe(1000);
  });
});

describe("criar item produzido com ficha", () => {
  it("grava item, ficha e componentes", async () => {
    const result = await createProducedItemWithRecipe(base);
    expect(result.ok).toBe(true);
    expect(holder.db.table("fastbar_produced_items")).toHaveLength(1);
    expect(holder.db.table("fastbar_production_recipes")).toHaveLength(1);
    expect(holder.db.table("fastbar_production_recipe_items")).toHaveLength(2);
  });

  it("não grava nada quando a ficha é inválida", async () => {
    const result = await createProducedItemWithRecipe({ ...base, yieldQuantity: 0 });
    expect(result.ok).toBe(false);
    expect(holder.db.table("fastbar_produced_items")).toHaveLength(0);
  });

  it("se salvar os ingredientes falha, desfaz o item (nada de ficha pela metade)", async () => {
    holder.db.failNext.set("fastbar_production_recipe_items:insert", "falha de rede");
    const result = await createProducedItemWithRecipe(base);
    expect(result.ok).toBe(false);
    expect(holder.db.table("fastbar_produced_items")).toHaveLength(0);
  });

  it("se salvar a ficha falha, desfaz o item", async () => {
    holder.db.failNext.set("fastbar_production_recipes:insert", "falha de rede");
    const result = await createProducedItemWithRecipe(base);
    expect(result.ok).toBe(false);
    expect(holder.db.table("fastbar_produced_items")).toHaveLength(0);
  });
});

describe("ordem de produção", () => {
  it("recusa quantidade inválida sem chamar o banco", async () => {
    const rpc = vi.fn();
    holder.db.rpcHandlers.set("fastbar_register_production_order", rpc);
    for (const batches of [0, -1, Number.NaN]) {
      const result = await registerProductionOrder({
        recipeId: "r",
        batches,
        realizadoPor: "equipe",
      });
      expect(result.ok).toBe(false);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("traduz o resultado do banco em mensagem para a equipe", async () => {
    const answer = (value: unknown) =>
      holder.db.rpcHandlers.set("fastbar_register_production_order", () => value);

    answer({ ok: false, code: "insufficient_stock", component: "Limão" });
    const short = await registerProductionOrder({
      recipeId: "r",
      batches: 2,
      realizadoPor: "equipe",
    });
    expect(short).toEqual({
      ok: false,
      message: "Limão não tem saldo suficiente para essa produção.",
    });

    answer({ ok: true, produced: 1350, cost_total: 12.5, unit_cost: 0.0093, cost_complete: true });
    const ok = await registerProductionOrder({ recipeId: "r", batches: 1, realizadoPor: "equipe" });
    expect(ok).toEqual({
      ok: true,
      produced: 1350,
      costTotal: 12.5,
      unitCost: 0.0093,
      costComplete: true,
    });

    answer({ ok: true, produced: 1350, cost_total: null, unit_cost: null, cost_complete: false });
    const partial = await registerProductionOrder({
      recipeId: "r",
      batches: 1,
      realizadoPor: "equipe",
    });
    expect(partial).toMatchObject({ ok: true, costTotal: null, costComplete: false });
  });

  it("repassa receitas e quem produziu para a função do banco", async () => {
    const rpc = vi.fn(() => ({ ok: true, produced: 10, cost_complete: true }));
    holder.db.rpcHandlers.set("fastbar_register_production_order", rpc);
    await registerProductionOrder({ recipeId: "ficha-1", batches: 3, realizadoPor: "equipe" });
    expect(rpc).toHaveBeenCalledWith({
      p_recipe_id: "ficha-1",
      p_batches: 3,
      p_realizado_por: "equipe",
    });
  });
});
