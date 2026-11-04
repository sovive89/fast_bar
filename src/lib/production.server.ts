/**
 * Produção (item 5 do roadmap, seção 5.5 da documentação funcional): fichas de produção que
 * transformam bebidas base e ingredientes em um item produzido, e ordens de produção que fazem a
 * baixa dos componentes e somam o saldo do item.
 *
 * A ordem de produção é atômica no banco (fastbar_register_production_order): confere o saldo de
 * todos os componentes antes de baixar qualquer um. Aqui fica o cadastro, a validação e a leitura.
 */

export type ProductionComponentKind = "base_drink" | "ingredient";

export interface RecipeComponentInput {
  kind: ProductionComponentKind;
  id: string;
  quantity: number;
}

export interface CreateRecipeInput {
  name: string;
  unit: string;
  yieldQuantity: number;
  lossPercent: number;
  components: RecipeComponentInput[];
}

export type ValidatedRecipe = {
  name: string;
  unit: string;
  yieldQuantity: number;
  lossPercent: number;
  components: RecipeComponentInput[];
};

/**
 * Valida a ficha antes de gravar qualquer coisa. Pura (sem banco) para dar mensagem clara de
 * "o que está errado" e poder ser testada sem montar um Supabase falso.
 */
export function validateRecipeInput(
  input: CreateRecipeInput,
): { ok: true; value: ValidatedRecipe } | { ok: false; message: string } {
  const name = input.name?.trim() ?? "";
  if (name.length === 0) return { ok: false, message: "Dê um nome ao item produzido." };

  const unit = input.unit?.trim() ?? "";
  if (unit.length === 0) return { ok: false, message: "Informe a unidade (ex.: ml, L, kg, un)." };

  const yieldQuantity = Number(input.yieldQuantity);
  if (!Number.isFinite(yieldQuantity) || yieldQuantity <= 0) {
    return { ok: false, message: "O rendimento precisa ser maior que zero." };
  }

  const lossPercent = Number(input.lossPercent ?? 0);
  if (!Number.isFinite(lossPercent) || lossPercent < 0 || lossPercent >= 100) {
    return { ok: false, message: "A perda prevista precisa estar entre 0 e 99%." };
  }

  if (!Array.isArray(input.components) || input.components.length === 0) {
    return { ok: false, message: "Inclua ao menos um ingrediente na ficha." };
  }

  const seen = new Set<string>();
  const components: RecipeComponentInput[] = [];
  for (const component of input.components) {
    if (component.kind !== "base_drink" && component.kind !== "ingredient") {
      return { ok: false, message: "Componente inválido." };
    }
    if (!component.id) return { ok: false, message: "Escolha o componente de cada linha." };
    const quantity = Number(component.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, message: "Cada componente precisa de uma quantidade maior que zero." };
    }
    const key = `${component.kind}:${component.id}`;
    if (seen.has(key)) return { ok: false, message: "O mesmo componente aparece duas vezes." };
    seen.add(key);
    components.push({ kind: component.kind, id: component.id, quantity });
  }

  return { ok: true, value: { name, unit, yieldQuantity, lossPercent, components } };
}

/** Quanto sobra de saldo por receita, depois da perda prevista — o que a tela mostra de prévia. */
export function expectedYield(yieldQuantity: number, lossPercent: number, batches = 1): number {
  return Math.round(yieldQuantity * batches * (1 - lossPercent / 100) * 1000) / 1000;
}

export interface ComponentOption {
  kind: ProductionComponentKind;
  id: string;
  name: string;
  unit: string;
  stock: number;
}

/** Bebidas base e ingredientes ativos que podem entrar numa ficha de produção. */
export async function listComponentOptions(): Promise<ComponentOption[]> {
  const { admin } = await import("./fastbar.server");
  const [{ data: drinks }, { data: ingredients }] = await Promise.all([
    admin()
      .from("fastbar_base_drinks")
      .select("id, name, unit, current_stock")
      .eq("active", true)
      .order("name"),
    admin()
      .from("fastbar_drink_ingredients")
      .select("id, name, unit, current_stock")
      .eq("active", true)
      .order("name"),
  ]);
  const toOption = (
    rows: { id: string; name: string; unit: string; current_stock: number | string }[] | null,
    kind: ProductionComponentKind,
  ): ComponentOption[] =>
    (rows ?? []).map((row) => ({
      kind,
      id: row.id,
      name: row.name,
      unit: row.unit,
      stock: Number(row.current_stock),
    }));
  return [...toOption(drinks, "base_drink"), ...toOption(ingredients, "ingredient")];
}

/**
 * Cria o item produzido, a ficha e seus componentes. O cliente do Supabase não tem transação entre
 * tabelas, então, se uma etapa falha, o item recém-criado é apagado (a ficha e os componentes saem
 * junto, por on delete cascade) — nunca fica uma ficha pela metade.
 */
export async function createProducedItemWithRecipe(
  input: CreateRecipeInput,
): Promise<{ ok: true; producedItemId: string } | { ok: false; message: string }> {
  const checked = validateRecipeInput(input);
  if (!checked.ok) return checked;
  const recipe = checked.value;

  const { admin } = await import("./fastbar.server");

  const { data: item, error: itemError } = await admin()
    .from("fastbar_produced_items")
    .insert({ name: recipe.name, unit: recipe.unit })
    .select("id")
    .single();
  if (itemError || !item) return { ok: false, message: "Não foi possível criar o item produzido." };

  const rollback = async () => {
    await admin().from("fastbar_produced_items").delete().eq("id", item.id);
  };

  const { data: header, error: headerError } = await admin()
    .from("fastbar_production_recipes")
    .insert({
      produced_item_id: item.id,
      yield_quantity: recipe.yieldQuantity,
      loss_percent: recipe.lossPercent,
    })
    .select("id")
    .single();
  if (headerError || !header) {
    await rollback();
    return { ok: false, message: "Não foi possível criar a ficha de produção." };
  }

  const { error: itemsError } = await admin()
    .from("fastbar_production_recipe_items")
    .insert(
      recipe.components.map((component) => ({
        recipe_id: header.id,
        component_kind: component.kind,
        component_id: component.id,
        quantity: component.quantity,
      })),
    );
  if (itemsError) {
    await rollback();
    return { ok: false, message: "Não foi possível salvar os ingredientes da ficha." };
  }

  return { ok: true, producedItemId: item.id };
}

export type ProductionOrderResult =
  | {
      ok: true;
      produced: number;
      costTotal: number | null;
      unitCost: number | null;
      costComplete: boolean;
    }
  | { ok: false; message: string };

/** Registra uma ordem de produção (baixa componentes, soma o saldo do item). Atômico no banco. */
export async function registerProductionOrder(params: {
  recipeId: string;
  batches: number;
  realizadoPor: string;
}): Promise<ProductionOrderResult> {
  const batches = Number(params.batches);
  if (!Number.isFinite(batches) || batches <= 0) {
    return { ok: false, message: "Informe quantas receitas produzir (maior que zero)." };
  }

  const { admin } = await import("./fastbar.server");
  const { data, error } = await admin().rpc("fastbar_register_production_order", {
    p_recipe_id: params.recipeId,
    p_batches: batches,
    p_realizado_por: params.realizadoPor,
  });
  const result = data as {
    ok: boolean;
    code?: string;
    component?: string;
    produced?: number;
    cost_total?: number | null;
    unit_cost?: number | null;
    cost_complete?: boolean;
  } | null;

  if (error || !result) return { ok: false, message: "Não foi possível registrar a produção." };
  if (!result.ok) {
    switch (result.code) {
      case "insufficient_stock":
        return {
          ok: false,
          message: `${result.component ?? "Um ingrediente"} não tem saldo suficiente para essa produção.`,
        };
      case "recipe_not_found":
        return { ok: false, message: "Ficha de produção não encontrada." };
      case "recipe_empty":
        return { ok: false, message: "A ficha não tem ingredientes." };
      case "component_not_found":
        return { ok: false, message: "Um ingrediente da ficha foi removido do estoque." };
      case "invalid_batches":
        return { ok: false, message: "Informe quantas receitas produzir (maior que zero)." };
      default:
        return { ok: false, message: "Não foi possível registrar a produção." };
    }
  }
  return {
    ok: true,
    produced: Number(result.produced ?? 0),
    costTotal: result.cost_total == null ? null : Number(result.cost_total),
    unitCost: result.unit_cost == null ? null : Number(result.unit_cost),
    costComplete: result.cost_complete ?? true,
  };
}

export interface ProductionOverview {
  items: {
    id: string;
    name: string;
    unit: string;
    stock: number;
    unitCost: number | null;
    recipe: {
      id: string;
      yieldQuantity: number;
      lossPercent: number;
      components: { kind: ProductionComponentKind; name: string; unit: string; quantity: number }[];
    } | null;
  }[];
  orders: {
    id: string;
    itemName: string;
    batches: number;
    produced: number;
    costTotal: number | null;
    costComplete: boolean;
    createdAt: string;
  }[];
}

export async function loadProductionOverview(): Promise<ProductionOverview> {
  const { admin } = await import("./fastbar.server");
  const [{ data: items }, { data: recipes }, { data: recipeItems }, { data: orders }, options] =
    await Promise.all([
      admin()
        .from("fastbar_produced_items")
        .select("id, name, unit, current_stock, unit_cost")
        .eq("active", true)
        .order("name"),
      admin()
        .from("fastbar_production_recipes")
        .select("id, produced_item_id, yield_quantity, loss_percent")
        .eq("active", true),
      admin()
        .from("fastbar_production_recipe_items")
        .select("recipe_id, component_kind, component_id, quantity"),
      admin()
        .from("fastbar_production_orders")
        .select(
          "id, produced_item_name, batches, quantity_produced, cost_total, cost_complete, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(20),
      listComponentOptions(),
    ]);

  const optionByKey = new Map(options.map((option) => [`${option.kind}:${option.id}`, option]));
  const recipeByItem = new Map((recipes ?? []).map((recipe) => [recipe.produced_item_id, recipe]));

  return {
    items: (items ?? []).map((item) => {
      const recipe = recipeByItem.get(item.id);
      return {
        id: item.id,
        name: item.name,
        unit: item.unit,
        stock: Number(item.current_stock),
        unitCost: item.unit_cost == null ? null : Number(item.unit_cost),
        recipe: recipe
          ? {
              id: recipe.id,
              yieldQuantity: Number(recipe.yield_quantity),
              lossPercent: Number(recipe.loss_percent),
              components: (recipeItems ?? [])
                .filter((row) => row.recipe_id === recipe.id)
                .map((row) => {
                  const option = optionByKey.get(`${row.component_kind}:${row.component_id}`);
                  return {
                    kind: row.component_kind as ProductionComponentKind,
                    name: option?.name ?? "Ingrediente removido",
                    unit: option?.unit ?? "",
                    quantity: Number(row.quantity),
                  };
                }),
            }
          : null,
      };
    }),
    orders: (orders ?? []).map((order) => ({
      id: order.id,
      itemName: order.produced_item_name,
      batches: Number(order.batches),
      produced: Number(order.quantity_produced),
      costTotal: order.cost_total == null ? null : Number(order.cost_total),
      costComplete: order.cost_complete,
      createdAt: order.created_at,
    })),
  };
}
