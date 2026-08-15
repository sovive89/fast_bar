import { createServerFn } from "@tanstack/react-start";

type PackagingInput = {
  purchaseUnit?: string | undefined;
  unitsPerPack?: number | undefined;
  contentAmount?: number | undefined;
};

/**
 * Valida a embalagem de compra. Recusa valor inválido em vez de normalizar em silêncio: salvar
 * uma embalagem diferente da que a pessoa digitou faria toda entrada futura calcular quantidade e
 * custo errados. units_per_pack/content_amount só podem fugir de 1×1 se houver purchase_unit —
 * sem isso a tela de entrada mostra "direto em ml/g/un" e multiplicaria pela embalagem escondida.
 */
function readPackaging(data: PackagingInput) {
  const unitsPerPack = data.unitsPerPack ?? 1;
  const contentAmount = data.contentAmount ?? 1;
  if (!Number.isInteger(unitsPerPack) || unitsPerPack <= 0) {
    return { ok: false as const, message: "Itens por embalagem deve ser um número inteiro maior que zero." };
  }
  if (!Number.isFinite(contentAmount) || contentAmount <= 0 || contentAmount >= 1000000) {
    return { ok: false as const, message: "Conteúdo por item deve ser maior que zero." };
  }
  if (!data.purchaseUnit?.trim() && (unitsPerPack !== 1 || contentAmount !== 1)) {
    return {
      ok: false as const,
      message: "Informe a unidade de compra (garrafa, caixa...) antes de mudar a embalagem.",
    };
  }
  return { ok: true as const, unitsPerPack, contentAmount };
}

/** Lê o total pago de uma entrada. `undefined` = entrada sem custo informado (permitido). */
function readPurchaseCost(value: number | undefined) {
  if (value === undefined) return { ok: true as const, purchaseCost: null };
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false as const, message: "Valor pago inválido." };
  }
  return { ok: true as const, purchaseCost: value > 0 ? value : null };
}

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
    .select(
      "id, name, unit, current_stock, min_stock, average_cost, active, purchase_unit, units_per_pack, content_amount",
    )
    .eq("active", true)
    .order("name");
  return { baseDrinks: data ?? [] };
});

export const createBaseDrink = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      name: string;
      unit: "ml" | "un";
      minStock?: number | undefined;
      purchaseUnit?: string | undefined;
      unitsPerPack?: number | undefined;
      contentAmount?: number | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const name = data.name.trim();
    if (name.length < 2) return { ok: false as const, message: "Nome da bebida base inválido." };
    if (data.unit !== "ml" && data.unit !== "un") {
      return { ok: false as const, message: "Unidade inválida." };
    }
    const packaging = readPackaging(data);
    if (!packaging.ok) return packaging;
    // Devolve o id para que a tela consiga dar a entrada de estoque logo em seguida, no mesmo
    // gesto de cadastrar — é assim que a compra acontece no bar: chega a mercadoria e se registra
    // o que chegou, não "cadastra agora e informa a quantidade depois".
    const { data: created, error } = await admin()
      .from("fastbar_base_drinks")
      .insert({
        name,
        unit: data.unit,
        min_stock: data.minStock && data.minStock > 0 ? data.minStock : 0,
        purchase_unit: data.purchaseUnit?.trim() || null,
        units_per_pack: packaging.unitsPerPack,
        content_amount: packaging.contentAmount,
      })
      .select("id")
      .maybeSingle();
    if (error || !created) {
      return { ok: false as const, message: "Não foi possível salvar a bebida base." };
    }
    return { ok: true as const, id: created.id };
  });

/**
 * Ajusta a embalagem de compra de uma bebida base já cadastrada. Necessário porque insumos criados
 * antes desse campo existir ficam em 1×1, o que faria a entrada de estoque pedir "embalagens" e
 * somar a quantidade errada.
 */
export const updateBaseDrinkPackaging = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      baseDrinkId: string;
      purchaseUnit?: string | undefined;
      unitsPerPack?: number | undefined;
      contentAmount?: number | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const packaging = readPackaging(data);
    if (!packaging.ok) return packaging;
    const { error } = await admin()
      .from("fastbar_base_drinks")
      .update({
        purchase_unit: data.purchaseUnit?.trim() || null,
        units_per_pack: packaging.unitsPerPack,
        content_amount: packaging.contentAmount,
      })
      .eq("id", data.baseDrinkId);
    if (error) return { ok: false as const, message: "Não foi possível salvar a embalagem." };
    return { ok: true as const };
  });

const DELETE_MESSAGES: Record<string, string> = {
  in_use_by_recipe: "Esse insumo está numa ficha técnica — remova a ligação antes de apagar.",
  has_sales_history: "Esse insumo já saiu em vendas de verdade — apagar perderia o rastro.",
  not_found: "Insumo não encontrado.",
};

/**
 * Apaga a bebida base de vez. O número de estoque nunca bloqueia — o que impede é uso real: estar
 * numa ficha técnica ou já ter saído por venda. Uma entrada de compra errada sozinha (sem venda)
 * não bloqueia, porque é exatamente o caso que essa ação existe pra resolver: "cadastrei garrafa
 * de 1L com conteúdo 1 em vez de 1000, quero apagar e refazer certo".
 */
export const deleteBaseDrink = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!teamPasswordMatches(data.password)) {
      return { ok: false as const, message: "Senha incorreta." };
    }
    const { data: result, error } = await admin().rpc("fastbar_delete_base_drink", {
      p_id: data.id,
    });
    const parsed = result as { ok: boolean; code?: string } | null;
    if (error || !parsed) return { ok: false as const, message: "Não foi possível apagar." };
    if (!parsed.ok) {
      return {
        ok: false as const,
        message: DELETE_MESSAGES[parsed.code ?? ""] ?? "Não foi possível apagar.",
      };
    }
    return { ok: true as const };
  });

/**
 * Dá entrada de estoque numa bebida base (compra). A equipe informa quantas embalagens de compra
 * (ex.: garrafas, caixas) e o custo total pago — a quantidade em `unit` e o custo por `unit` são
 * sempre calculados a partir de units_per_pack/content_amount, nunca digitados diretamente.
 */
export const addBaseDrinkEntry = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      baseDrinkId: string;
      packs: number;
      purchaseCost?: number | undefined;
      supplierId?: string | undefined;
      note?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const packs = Number(data.packs);
    if (!Number.isInteger(packs) || packs <= 0) {
      return { ok: false as const, message: "Informe uma quantidade de embalagens válida." };
    }

    const cost = readPurchaseCost(data.purchaseCost);
    if (!cost.ok) return cost;

    const { data: material } = await admin()
      .from("fastbar_base_drinks")
      .select("id, current_stock, average_cost, units_per_pack, content_amount")
      .eq("id", data.baseDrinkId)
      .maybeSingle();
    if (!material) return { ok: false as const, message: "Bebida base não encontrada." };

    const quantity = packs * material.units_per_pack * Number(material.content_amount);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false as const, message: "Embalagem mal configurada — revise o cadastro." };
    }
    const unitCost = cost.purchaseCost !== null ? cost.purchaseCost / quantity : null;

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
    .select(
      "id, name, unit, current_stock, min_stock, average_cost, active, purchase_unit, units_per_pack, content_amount",
    )
    .eq("active", true)
    .order("name");
  return { ingredients: data ?? [] };
});

export const createIngredient = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      name: string;
      unit: "ml" | "un" | "g";
      minStock?: number | undefined;
      purchaseUnit?: string | undefined;
      unitsPerPack?: number | undefined;
      contentAmount?: number | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const name = data.name.trim();
    if (name.length < 2) return { ok: false as const, message: "Nome do ingrediente inválido." };
    if (!["ml", "un", "g"].includes(data.unit)) {
      return { ok: false as const, message: "Unidade inválida." };
    }
    const packaging = readPackaging(data);
    if (!packaging.ok) return packaging;
    // Mesmo motivo de createBaseDrink: o id volta para a tela dar a entrada em seguida.
    const { data: created, error } = await admin()
      .from("fastbar_drink_ingredients")
      .insert({
        name,
        unit: data.unit,
        min_stock: data.minStock && data.minStock > 0 ? data.minStock : 0,
        purchase_unit: data.purchaseUnit?.trim() || null,
        units_per_pack: packaging.unitsPerPack,
        content_amount: packaging.contentAmount,
      })
      .select("id")
      .maybeSingle();
    if (error || !created) {
      return { ok: false as const, message: "Não foi possível salvar o ingrediente." };
    }
    return { ok: true as const, id: created.id };
  });

/** Ajusta a embalagem de compra de um ingrediente já cadastrado — mesmo motivo da bebida base. */
export const updateIngredientPackaging = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      ingredientId: string;
      purchaseUnit?: string | undefined;
      unitsPerPack?: number | undefined;
      contentAmount?: number | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const packaging = readPackaging(data);
    if (!packaging.ok) return packaging;
    const { error } = await admin()
      .from("fastbar_drink_ingredients")
      .update({
        purchase_unit: data.purchaseUnit?.trim() || null,
        units_per_pack: packaging.unitsPerPack,
        content_amount: packaging.contentAmount,
      })
      .eq("id", data.ingredientId);
    if (error) return { ok: false as const, message: "Não foi possível salvar a embalagem." };
    return { ok: true as const };
  });

/** Apaga o ingrediente de vez. Mesmo critério da bebida base: histórico real bloqueia, número de estoque não. */
export const deleteIngredient = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!teamPasswordMatches(data.password)) {
      return { ok: false as const, message: "Senha incorreta." };
    }
    const { data: result, error } = await admin().rpc("fastbar_delete_ingredient", {
      p_id: data.id,
    });
    const parsed = result as { ok: boolean; code?: string } | null;
    if (error || !parsed) return { ok: false as const, message: "Não foi possível apagar." };
    if (!parsed.ok) {
      return {
        ok: false as const,
        message: DELETE_MESSAGES[parsed.code ?? ""] ?? "Não foi possível apagar.",
      };
    }
    return { ok: true as const };
  });

/**
 * Dá entrada de estoque num ingrediente (compra) — mesmo padrão da bebida base: embalagens de
 * compra + custo total pago, com quantidade e custo por `unit` sempre calculados.
 */
export const addIngredientEntry = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      ingredientId: string;
      packs: number;
      purchaseCost?: number | undefined;
      supplierId?: string | undefined;
      note?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const packs = Number(data.packs);
    if (!Number.isInteger(packs) || packs <= 0) {
      return { ok: false as const, message: "Informe uma quantidade de embalagens válida." };
    }

    const cost = readPurchaseCost(data.purchaseCost);
    if (!cost.ok) return cost;

    const { data: ingredient } = await admin()
      .from("fastbar_drink_ingredients")
      .select("id, current_stock, average_cost, units_per_pack, content_amount")
      .eq("id", data.ingredientId)
      .maybeSingle();
    if (!ingredient) return { ok: false as const, message: "Ingrediente não encontrado." };

    const quantity = packs * ingredient.units_per_pack * Number(ingredient.content_amount);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false as const, message: "Embalagem mal configurada — revise o cadastro." };
    }
    const unitCost = cost.purchaseCost !== null ? cost.purchaseCost / quantity : null;

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

/**
 * Categoria do cardápio é a divisão do menu (Bebidas, Doses, Drinks) — nada além de um nome.
 * Entidade própria, separada do formulário de produto, pra criar uma categoria nova nunca exigir
 * preencher preço/unidade/foto de um produto que não existe.
 */
export const listProductCategories = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { data } = await admin()
    .from("fastbar_product_categories")
    .select("id, name")
    .order("name");
  return { categories: data ?? [] };
});

export const createProductCategory = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const name = data.name.trim();
    if (name.length < 2) return { ok: false as const, message: "Digite um nome de categoria." };

    const { error } = await admin().from("fastbar_product_categories").insert({ name });
    if (error) {
      // Nome único: categoria repetida (mesmo com maiúscula/minúscula diferente) cai aqui.
      if (error.code === "23505") {
        return { ok: false as const, message: "Já existe uma categoria com esse nome." };
      }
      return { ok: false as const, message: "Não foi possível criar a categoria." };
    }
    return { ok: true as const };
  });

export const PRODUCT_UNITS = ["un", "ml", "L", "g", "kg"] as const;
export const PRODUCT_PACKAGE_TYPES = [
  "Lata",
  "Garrafa",
  "Dose",
  "Barril",
  "Copo",
  "Porção",
  "Outro",
] as const;

export const createProduct = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      name: string;
      price: number;
      category: string;
      unit: string;
      packageType?: string;
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
    const unit = PRODUCT_UNITS.includes(data.unit as (typeof PRODUCT_UNITS)[number])
      ? data.unit
      : "un";
    if (name.length < 2) return { ok: false as const, message: "Nome do produto inválido." };
    if (!Number.isFinite(price) || price < 0) {
      return { ok: false as const, message: "Preço inválido." };
    }

    const initialStock =
      data.stockQuantity && data.stockQuantity > 0 ? Math.floor(data.stockQuantity) : 0;

    const { data: inserted, error } = await admin()
      .from("fastbar_products")
      .insert({
        name,
        category,
        price,
        unit,
        package_type: data.packageType?.trim() || null,
        image_url: data.imageUrl?.trim() || null,
        stock_quantity: initialStock,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      return { ok: false as const, message: "Não foi possível salvar o produto." };
    }

    // Registra o estoque inicial como movimento: sem isso o saldo apareceria do nada, sem
    // rastro, e o produto contaria como "sem nenhuma entrada" pra quem checa se já foi
    // configurado.
    if (initialStock > 0) {
      await admin().from("fastbar_stock_movements").insert({
        product_id: inserted.id,
        quantity: initialStock,
        movement_type: "in",
        note: "Estoque inicial no cadastro",
      });
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
      .select(
        "id, name, unit, current_stock, min_stock, average_cost, purchase_unit, units_per_pack, content_amount",
      )
      .eq("active", true)
      .order("name"),
    admin()
      .from("fastbar_drink_ingredients")
      .select(
        "id, name, unit, current_stock, min_stock, average_cost, purchase_unit, units_per_pack, content_amount",
      )
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
