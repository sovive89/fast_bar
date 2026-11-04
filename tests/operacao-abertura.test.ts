import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

// O código testado pega o cliente do Supabase em fastbar.server (admin()). Trocar esse módulo por
// um que devolve o banco falso faz toda a lógica real (stock-count.server, operations.server) rodar
// sem banco de verdade.
const holder: { db: FakeSupabase } = { db: new FakeSupabase() };
vi.mock("../src/lib/fastbar.server", () => ({ admin: () => holder.db }));

const { listCountableProducts, recordStockCountAndOpenOperation, skipStockCountAndOpenOperation } =
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
    const products = await listCountableProducts();
    expect(products.map((product) => product.id).sort()).toEqual(["agua", "cerveja"]);
  });
});

describe("concluir conferência e abrir operação", () => {
  it("recusa diferença sem motivo e não abre a operação", async () => {
    const result = await recordStockCountAndOpenOperation({
      items: [{ productId: "cerveja", contada: 20 }],
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
      items: [{ productId: "agua", contada: -1 }],
      realizadoPor: "equipe",
    });
    expect(result.ok).toBe(false);
    expect(holder.db.table("fastbar_operations")).toHaveLength(0);
  });

  it("abre a operação e registra cada item, com motivo só onde houve diferença", async () => {
    const result = await recordStockCountAndOpenOperation({
      items: [
        {
          productId: "cerveja",
          contada: 20,
          motivo: "perda_quebra",
          observacao: "4 latas amassadas",
        },
        { productId: "agua", contada: 10 },
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
      items: [{ productId: "cerveja", contada: 3, motivo: "divergencia_nao_identificada" }],
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
