import { createServerFn } from "@tanstack/react-start";

export const getStockOverview = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const [{ data: products }, { data: recipeLinks }] = await Promise.all([
    admin()
      .from("fastbar_products")
      .select("id, name, category, price, unit, package_type, is_active, stock_quantity, image_url")
      .order("category")
      .order("name"),
    admin().from("fastbar_recipe_items").select("product_id"),
  ]);
  // Produtos com ficha técnica não têm stock_quantity próprio confiável — quem controla
  // disponibilidade pra eles é o estoque dos componentes (bebidas base/ingredientes), não este campo.
  const recipeProductIds = Array.from(new Set((recipeLinks ?? []).map((link) => link.product_id)));
  return { products: products ?? [], recipeProductIds };
});

export const restockProduct = createServerFn({ method: "POST" })
  .inputValidator((data: { productId: string; quantity: number }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const quantity = Math.floor(Number(data.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false as const, message: "Informe uma quantidade válida." };
    }

    // O saldo é somado dentro do banco (`set stock_quantity = stock_quantity + n`), junto com o
    // registro do movimento. Ler o saldo aqui e gravar depois perderia uma das entradas se duas
    // reposições acontecessem ao mesmo tempo.
    const { data: result, error } = await admin().rpc("fastbar_restock_product", {
      p_product_id: data.productId,
      p_quantity: quantity,
    });
    const parsed = result as { ok: boolean; code?: string; new_quantity?: number } | null;
    if (error || !parsed) {
      return { ok: false as const, message: "Não foi possível registrar a entrada." };
    }
    if (!parsed.ok) {
      return {
        ok: false as const,
        message:
          parsed.code === "product_not_found"
            ? "Produto não encontrado."
            : "Informe uma quantidade válida.",
      };
    }
    return { ok: true as const, newQuantity: parsed.new_quantity ?? 0 };
  });
