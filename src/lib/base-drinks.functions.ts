import { createServerFn } from "@tanstack/react-start";

// ============ FORNECEDORES ============

export const listSuppliers = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { data } = await admin()
    .from("fastbar_suppliers")
    .select("id, name, document, phone, active")
    .eq("active", true)
    .order("name");
  return { suppliers: data ?? [] };
});

export const createSupplier = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; document?: string; phone?: string; email?: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const name = data.name.trim();
    if (name.length < 2) return { ok: false as const, message: "Nome do fornecedor inválido." };
    const { error } = await admin().from("fastbar_suppliers").insert({
      name,
      document: data.document?.trim() || null,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
    });
    if (error) return { ok: false as const, message: "Não foi possível salvar o fornecedor." };
    return { ok: true as const };
  });

// ============ INSUMOS (garrafas/pacotes) ============

export const listBaseDrinks = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { data } = await admin()
    .from("fastbar_base_drinks")
    .select("id, name, unit, current_stock, min_stock, average_cost, active")
    .eq("active", true)
    .order("name");
  return { baseDrinks: data ?? [] };
});

export const createBaseDrink = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; unit: "ml" | "un"; minStock?: number }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const name = data.name.trim();
    if (name.length < 2) return { ok: false as const, message: "Nome da bebida base inválido." };
    if (data.unit !== "ml" && data.unit !== "un") {
      return { ok: false as const, message: "Unidade inválida." };
    }
    const { error } = await admin().from("fastbar_base_drinks").insert({
      name,
      unit: data.unit,
      min_stock: data.minStock && data.minStock > 0 ? data.minStock : 0,
    });
    if (error) return { ok: false as const, message: "Não foi possível salvar a bebida base." };
    return { ok: true as const };
  });

/** Dá entrada de estoque numa bebida base (compra) — registra fornecedor + custo pago e atualiza o custo médio. */
export const addBaseDrinkEntry = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      baseDrinkId: string;
      quantity: number;
      unitCost?: number;
      supplierId?: string;
      note?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const quantity = Number(data.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false as const, message: "Informe uma quantidade válida." };
    }

    const { data: material } = await admin()
      .from("fastbar_base_drinks")
      .select("id, current_stock, average_cost")
      .eq("id", data.baseDrinkId)
      .maybeSingle();
    if (!material) return { ok: false as const, message: "Bebida base não encontrada." };

    const unitCost = data.unitCost && data.unitCost > 0 ? Number(data.unitCost) : null;

    const { error: movementError } = await admin().from("fastbar_base_drink_movements").insert({
      base_drink_id: material.id,
      type: "entrada",
      quantity,
      reason: "compra",
      supplier_id: data.supplierId || null,
      unit_cost: unitCost,
      note: data.note?.trim() || null,
    });
    if (movementError) {
      return { ok: false as const, message: "Não foi possível registrar a entrada." };
    }

    // custo médio ponderado, se veio custo nesta entrada
    const currentStock = Number(material.current_stock);
    const currentAvg = Number(material.average_cost);
    const newStock = currentStock + quantity;
    const newAvg =
      unitCost !== null && newStock > 0
        ? (currentStock * currentAvg + quantity * unitCost) / newStock
        : currentAvg;

    const { error: updateError } = await admin()
      .from("fastbar_base_drinks")
      .update({ current_stock: newStock, average_cost: newAvg })
      .eq("id", material.id);
    if (updateError) {
      return { ok: false as const, message: "Não foi possível atualizar o estoque da bebida base." };
    }

    return { ok: true as const, newStock };
  });

// ============ INGREDIENTES DE DRINK (xarope, suco, refrigerante etc.) ============
// Nunca vendidos sozinhos — só existem pra entrar numa mistura.

export const listIngredients = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { data } = await admin()
    .from("fastbar_drink_ingredients")
    .select("id, name, unit, current_stock, min_stock, average_cost, active")
    .eq("active", true)
    .order("name");
  return { ingredients: data ?? [] };
});

export const createIngredient = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; unit: "ml" | "un" | "g"; minStock?: number }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const name = data.name.trim();
    if (name.length < 2) return { ok: false as const, message: "Nome do ingrediente inválido." };
    if (!["ml", "un", "g"].includes(data.unit)) {
      return { ok: false as const, message: "Unidade inválida." };
    }
    const { error } = await admin().from("fastbar_drink_ingredients").insert({
      name,
      unit: data.unit,
      min_stock: data.minStock && data.minStock > 0 ? data.minStock : 0,
    });
    if (error) return { ok: false as const, message: "Não foi possível salvar o ingrediente." };
    return { ok: true as const };
  });

/** Dá entrada de estoque num ingrediente (compra) — mesmo padrão da bebida base. */
export const addIngredientEntry = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      ingredientId: string;
      quantity: number;
      unitCost?: number;
      supplierId?: string;
      note?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const quantity = Number(data.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false as const, message: "Informe uma quantidade válida." };
    }

    const { data: ingredient } = await admin()
      .from("fastbar_drink_ingredients")
      .select("id, current_stock, average_cost")
      .eq("id", data.ingredientId)
      .maybeSingle();
    if (!ingredient) return { ok: false as const, message: "Ingrediente não encontrado." };

    const unitCost = data.unitCost && data.unitCost > 0 ? Number(data.unitCost) : null;

    const { error: movementError } = await admin().from("fastbar_drink_ingredient_movements").insert({
      ingredient_id: ingredient.id,
      type: "entrada",
      quantity,
      reason: "compra",
      supplier_id: data.supplierId || null,
      unit_cost: unitCost,
      note: data.note?.trim() || null,
    });
    if (movementError) {
      return { ok: false as const, message: "Não foi possível registrar a entrada." };
    }

    const currentStock = Number(ingredient.current_stock);
    const currentAvg = Number(ingredient.average_cost);
    const newStock = currentStock + quantity;
    const newAvg =
      unitCost !== null && newStock > 0
        ? (currentStock * currentAvg + quantity * unitCost) / newStock
        : currentAvg;

    const { error: updateError } = await admin()
      .from("fastbar_drink_ingredients")
      .update({ current_stock: newStock, average_cost: newAvg })
      .eq("id", ingredient.id);
    if (updateError) {
      return { ok: false as const, message: "Não foi possível atualizar o estoque do ingrediente." };
    }

    return { ok: true as const, newStock };
  });

// ============ PRODUTOS (cardápio) ============

export const listAllProducts = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { data } = await admin()
    .from("fastbar_products")
    .select("id, name, category, is_active")
    .order("category")
    .order("name");
  return { products: data ?? [] };
});

export const createProduct = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      name: string;
      price: number;
      category: string;
      imageUrl?: string;
      stockQuantity?: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const name = data.name.trim();
    const category = data.category.trim() || "Bebidas";
    const price = Number(data.price);
    if (name.length < 2) return { ok: false as const, message: "Nome do produto inválido." };
    if (!Number.isFinite(price) || price < 0) {
      return { ok: false as const, message: "Preço inválido." };
    }

    const { data: inserted, error } = await admin()
      .from("fastbar_products")
      .insert({
        name,
        category,
        price,
        image_url: data.imageUrl?.trim() || null,
        stock_quantity: data.stockQuantity && data.stockQuantity > 0 ? data.stockQuantity : 0,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      return { ok: false as const, message: "Não foi possível salvar o produto." };
    }
    return { ok: true as const, productId: inserted.id };
  });

/** Recebe uma imagem em base64 (data URL) e sobe pro Storage, devolvendo a URL pública. */
export const uploadProductPhoto = createServerFn({ method: "POST" })
  .inputValidator((data: { fileName: string; base64: string; contentType: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${Date.now()}-${safeName}`;
    const bytes = Buffer.from(data.base64, "base64");

    const { error } = await admin()
      .storage.from("fastbar-products")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (error) return { ok: false as const, message: "Não foi possível enviar a foto." };

    const { data: publicUrl } = admin().storage.from("fastbar-products").getPublicUrl(path);
    return { ok: true as const, url: publicUrl.publicUrl };
  });

// ============ FICHA TÉCNICA (receita) ============
// Cada linha da receita aponta pra UM componente: uma bebida base OU um ingrediente.

export const getRecipeItems = createServerFn({ method: "POST" })
  .inputValidator((data: { productId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { data: items } = await admin()
      .from("fastbar_recipe_items")
      .select(
        "id, base_drink_id, ingredient_id, quantity, fastbar_base_drinks(name, unit), fastbar_drink_ingredients(name, unit)",
      )
      .eq("product_id", data.productId);

    // O join do supabase-js pode vir como objeto único ou array de 1 — normaliza pra objeto único.
    type Joined = { name: string; unit: string } | { name: string; unit: string }[] | null;
    const unwrap = (value: Joined) => (Array.isArray(value) ? (value[0] ?? null) : value);

    const normalized = (items ?? []).map((item) => ({
      id: item.id,
      base_drink_id: item.base_drink_id,
      ingredient_id: item.ingredient_id,
      quantity: item.quantity,
      base_drink: unwrap(item.fastbar_base_drinks as Joined),
      ingredient: unwrap(item.fastbar_drink_ingredients as Joined),
    }));

    return { items: normalized };
  });

/** Substitui a ficha técnica inteira do produto pelos itens enviados. */
export const setRecipeItems = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      productId: string;
      items: Array<
        | { type: "base_drink"; baseDrinkId: string; quantity: number }
        | { type: "ingredient"; ingredientId: string; quantity: number }
      >;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const valid = data.items.filter((item) => Number(item.quantity) > 0);

    await admin().from("fastbar_recipe_items").delete().eq("product_id", data.productId);

    if (valid.length > 0) {
      const { error } = await admin().from("fastbar_recipe_items").insert(
        valid.map((item) => ({
          product_id: data.productId,
          base_drink_id: item.type === "base_drink" ? item.baseDrinkId : null,
          ingredient_id: item.type === "ingredient" ? item.ingredientId : null,
          quantity: Number(item.quantity),
        })),
      );
      if (error) return { ok: false as const, message: "Não foi possível salvar a ficha técnica." };
    }

    return { ok: true as const };
  });

type DoseInfo = { productName: string; doses: number };

/** Visão geral do estoque (bebidas base + ingredientes) com doses possíveis já calculadas. */
export const getBaseDrinksOverview = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();

  const [{ data: baseDrinks }, { data: ingredients }, { data: recipes }] = await Promise.all([
    admin()
      .from("fastbar_base_drinks")
      .select("id, name, unit, current_stock, min_stock, average_cost")
      .eq("active", true)
      .order("name"),
    admin()
      .from("fastbar_drink_ingredients")
      .select("id, name, unit, current_stock, min_stock, average_cost")
      .eq("active", true)
      .order("name"),
    admin()
      .from("fastbar_recipe_items")
      .select("product_id, base_drink_id, ingredient_id, quantity, fastbar_products(name)"),
  ]);

  const dosesByComponent = new Map<string, DoseInfo[]>();
  for (const recipe of recipes ?? []) {
    const componentId = recipe.base_drink_id ?? recipe.ingredient_id;
    const stockSource = recipe.base_drink_id
      ? (baseDrinks ?? []).find((m) => m.id === recipe.base_drink_id)
      : (ingredients ?? []).find((i) => i.id === recipe.ingredient_id);
    if (!componentId || !stockSource || recipe.quantity <= 0) continue;
    const doses = Math.floor(Number(stockSource.current_stock) / Number(recipe.quantity));
    const list = dosesByComponent.get(componentId) ?? [];
    const productJoin = (recipe as { fastbar_products?: { name: string } | { name: string }[] | null })
      .fastbar_products;
    const productName = Array.isArray(productJoin) ? productJoin[0]?.name : productJoin?.name;
    list.push({ productName: productName ?? "—", doses });
    dosesByComponent.set(componentId, list);
  }

  return {
    baseDrinks: (baseDrinks ?? []).map((item) => ({
      ...item,
      doses: dosesByComponent.get(item.id) ?? [],
    })),
    ingredients: (ingredients ?? []).map((item) => ({
      ...item,
      doses: dosesByComponent.get(item.id) ?? [],
    })),
  };
});
