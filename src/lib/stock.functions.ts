import { createServerFn } from "@tanstack/react-start";

export const getStockOverview = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { data: products } = await admin()
    .from("fastbar_products")
    .select("id, name, category, price, unit, package_type, is_active, stock_quantity, image_url")
    .order("category")
    .order("name");
  return { products: products ?? [] };
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

    const { data: product } = await admin()
      .from("fastbar_products")
      .select("id, stock_quantity")
      .eq("id", data.productId)
      .maybeSingle();
    if (!product) return { ok: false as const, message: "Produto não encontrado." };

    const { error: movementError } = await admin().from("fastbar_stock_movements").insert({
      product_id: product.id,
      quantity,
      movement_type: "in",
      note: "Reposição manual",
    });
    if (movementError) {
      return { ok: false as const, message: "Não foi possível registrar a entrada." };
    }

    const newQuantity = product.stock_quantity + quantity;
    const { error: updateError } = await admin()
      .from("fastbar_products")
      .update({ stock_quantity: newQuantity })
      .eq("id", product.id);
    if (updateError) {
      return { ok: false as const, message: "Não foi possível atualizar o estoque." };
    }

    return { ok: true as const, newQuantity };
  });
