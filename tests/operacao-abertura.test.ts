import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

// O código testado pega o cliente do Supabase em fastbar.server (admin()). Trocar esse módulo por
// um que devolve o banco falso faz toda a lógica real (stock-count.server, operations.server) rodar
// sem banco de verdade.
const holder: { db: FakeSupabase } = { db: new FakeSupabase() };
vi.mock("../src/lib/fastbar.server", () => ({ admin: () => holder.db }));

const { listCountableItems, recordStockCountAndOpenOperation, skipStockCountAndOpenOperation } =
  await import("../src/lib/stock-count.server");
const { assertOperationOpen } = await import("../src/lib/operations.server");

function seedProducts(db: FakeSupabase) {
  db.seed("fastbar_products", [
    {
      id: "cerveja",
      name: "Cerveja lata",
      category: "Cervejas",
      unit: "un",
      stock_quantity: 24,
      is_active: true,
      unlimited_stock: false,
    },
    {
      id: "agua",
      name: "Água",
      category: "Sem álcool",
      unit: "un",
      stock_quantity: 10,
      is_active: true,
      unlimited_stock: false,
    },
    {
      id: "drink",
      name: "Caipirinha",
      category: "Drinks",
      unit: "un",
      stock_quantity: 0,
      is_active: true,
      unlimited_stock: false,
    },
    {
      id: "chopp",
      name: "Chopp",
      category: "Chopp",
      unit: "ml",
      stock_quantity: 0,
      is_active: true,
      unlimited_stock: true,
    },
    {
      id: "velho",
      name: "Produto desativado",
      category: "Outros",
      unit: "un",
      stock_quantity: 5,
      is_active: false,
      unlimited_stock: false,
    },
  ]);
  // Caipirinha tem ficha técnica: o saldo dela vem dos ingredientes, não de stock_quantity.
  db.seed("fastbar_recipe_items", [{ product_id: "drink", quantity: 1 }]);
}

beforeEach(() => {
  holder.db = new FakeSupabase();
  seedProducts(holder.db);
});

describe("produtos que entram na conferência", () => {
  it("só lista produtos ativos, com saldo próprio e sem ficha técnica", async () => {
    const products = await listCountableItems();
    expect(products.map((product) => product.key).sort()).toEqual([
      "product:agua",
      "product:cerveja",
    ]);
  });
});

describe("concluir conferência e abrir operação", () => {
  it("recusa diferença sem motivo e não abre a operação", async () => {
    const result = await recordStockCountAndOpenOperation({
      items: [{ itemKey: "product:cerveja", contada: 20 }],
      realizadoPor: "equipe",
    });
    expect(result).toEqual({
      ok: false,
      message: 'Informe o motivo da diferença em "Cerveja lata".',
    });
    expect(holder.db.table("fastbar_operations")).toHaveLength(0);
    expect(holder.db.table("fastbar_stock_counts")).toHaveLength(0);
  });

  it("recusa quantidade negativa", async () => {
    const result = await recordStockCountAndOpenOperation({
      items: [{ itemKey: "product:agua", contada: -1 }],
      realizadoPor: "equipe",
    });
    expect(result.ok).toBe(false);
    expect(holder.db.table("fastbar_operations")).toHaveLength(0);
  });

  it("abre a operação e registra cada item, com motivo só onde houve diferença", async () => {
    const result = await recordStockCountAndOpenOperation({
      items: [
        {
          itemKey: "product:cerveja",
          contada: 20,
          motivo: "perda_quebra",
          observacao: "4 latas amassadas",
        },
        { itemKey: "product:agua", contada: 10 },
      ],
      realizadoPor: "equipe",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.divergences).toBe(1);
    expect(result.auditWarning).toBeUndefined();

    const [operation] = holder.db.table("fastbar_operations");
    expect(operation).toMatchObject({ status: "ABERTA" });

    const [count] = holder.db.table("fastbar_stock_counts");
    expect(count).toMatchObject({ operacao_id: operation!.id, status: "CONCLUIDA" });

    const items = holder.db.table("fastbar_stock_count_items");
    expect(items).toHaveLength(2);
    expect(items.find((item) => item.product_id === "cerveja")).toMatchObject({
      item_kind: "product",
      item_id: "cerveja",
      quantidade_esperada: 24,
      quantidade_contada: 20,
      motivo: "perda_quebra",
      observacao: "4 latas amassadas",
    });
    expect(items.find((item) => item.product_id === "agua")).toMatchObject({
      quantidade_esperada: 10,
      quantidade_contada: 10,
      motivo: null,
      observacao: null,
    });
  });

  it("só registra a conferência: nunca altera o saldo do produto", async () => {
    await recordStockCountAndOpenOperation({
      items: [{ itemKey: "product:cerveja", contada: 3, motivo: "divergencia_nao_identificada" }],
      realizadoPor: "equipe",
    });
    const cerveja = holder.db.table("fastbar_products").find((product) => product.id === "cerveja");
    expect(cerveja?.stock_quantity).toBe(24);
  });

  it("não abre uma segunda operação se já existe uma aberta", async () => {
    await recordStockCountAndOpenOperation({ items: [], realizadoPor: "equipe" });
    const second = await recordStockCountAndOpenOperation({ items: [], realizadoPor: "equipe" });
    expect(second).toEqual({ ok: false, message: "Já existe uma operação aberta." });
    expect(holder.db.table("fastbar_operations")).toHaveLength(1);
  });

  it("avisa quando a operação abriu mas a auditoria não foi gravada", async () => {
    holder.db.failNext.set("fastbar_stock_counts:insert", "network");
    const result = await recordStockCountAndOpenOperation({ items: [], realizadoPor: "equipe" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.auditWarning).toMatch(/não foi salvo/);
  });
});

describe("pular a conferência", () => {
  it("exige um motivo de pelo menos 5 caracteres", async () => {
    const result = await skipStockCountAndOpenOperation({
      motivo: "  ok  ",
      realizadoPor: "equipe",
    });
    expect(result.ok).toBe(false);
    expect(holder.db.table("fastbar_operations")).toHaveLength(0);
  });

  it("abre a operação e registra o pulo com o motivo", async () => {
    const result = await skipStockCountAndOpenOperation({
      motivo: "Gerente ausente, conferência amanhã cedo",
      realizadoPor: "equipe",
    });
    expect(result.ok).toBe(true);
    const [count] = holder.db.table("fastbar_stock_counts");
    expect(count).toMatchObject({
      status: "PULADA",
      motivo_pulo: "Gerente ausente, conferência amanhã cedo",
    });
  });
});

describe("trava de comandas", () => {
  it("bloqueia comanda nova sem operação aberta e libera depois de abrir", async () => {
    expect((await assertOperationOpen()).ok).toBe(false);
    await skipStockCountAndOpenOperation({ motivo: "Teste automatizado", realizadoPor: "equipe" });
    expect((await assertOperationOpen()).ok).toBe(true);
  });
});

describe("bebidas base e ingredientes", () => {
  beforeEach(() => {
    holder.db.seed("fastbar_base_drinks", [
      { id: "vodka", name: "Vodka", unit: "ml", current_stock: 2100, active: true },
      { id: "gin-velho", name: "Gin antigo", unit: "ml", current_stock: 300, active: false },
    ]);
    holder.db.seed("fastbar_drink_ingredients", [
      { id: "limao", name: "Limão", unit: "un", current_stock: "0.3", active: true },
    ]);
  });

  it("entram na conferência junto com os produtos, só os ativos", async () => {
    const items = await listCountableItems();
    expect(items.map((item) => [item.key, item.category])).toEqual([
      ["base_drink:vodka", "Bebidas base"],
      ["ingredient:limao", "Ingredientes"],
      ["product:cerveja", "Cervejas"],
      ["product:agua", "Sem álcool"],
    ]);
  });

  it("aceitam contagem fracionada e registram o tipo do item", async () => {
    const result = await recordStockCountAndOpenOperation({
      items: [
        { itemKey: "base_drink:vodka", contada: 1750.5, motivo: "consumo_interno" },
        // 0.1 + 0.2 em ponto flutuante não é 0.3 — não pode virar "diferença" fantasma.
        { itemKey: "ingredient:limao", contada: 0.1 + 0.2 },
      ],
      realizadoPor: "equipe",
    });
    expect(result.ok).toBe(true);

    const items = holder.db.table("fastbar_stock_count_items");
    expect(items.find((item) => item.item_id === "vodka")).toMatchObject({
      item_kind: "base_drink",
      product_id: null,
      product_name: "Vodka",
      quantidade_esperada: 2100,
      quantidade_contada: 1750.5,
      motivo: "consumo_interno",
    });
    expect(items.find((item) => item.item_id === "limao")).toMatchObject({
      item_kind: "ingredient",
      quantidade_esperada: 0.3,
      quantidade_contada: 0.3,
      motivo: null,
    });
  });

  it("nunca altera o saldo da bebida base", async () => {
    await recordStockCountAndOpenOperation({
      items: [{ itemKey: "base_drink:vodka", contada: 0, motivo: "divergencia_nao_identificada" }],
      realizadoPor: "equipe",
    });
    const vodka = holder.db.table("fastbar_base_drinks").find((row) => row.id === "vodka");
    expect(vodka?.current_stock).toBe(2100);
  });
});
