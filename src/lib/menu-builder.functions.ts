import { createServerFn } from "@tanstack/react-start";
import type { EntryMode, LotTraceability } from "./base-drinks.functions";

/**
 * Construtor de cardápio unificado com estoque — backend/lógica apenas (a tela é outro projeto).
 *
 * A ideia central: criar um item de cardápio SEMPRE nasce com uma origem de estoque definida, em
 * vez de cair no limbo "não configurado" que existia até aqui (produto criado, sem ficha técnica
 * e sem nenhuma entrada — fastbar_add_tab_item rejeitava a venda com product_not_configured).
 * Duas origens, e nenhuma delas é um conceito novo:
 *
 * 1. "own" — o produto tem SEU PRÓPRIO saldo, agora rastreado por lote (fastbar_stock_lots com
 *    component_kind='product', mesma tabela de bebida base/ingrediente — ver migration
 *    produto_com_estoque_proprio_em_lotes). Isso substitui o antigo addProductEntry/
 *    restockProduct (stock.functions.ts), que só mexia num contador solto sem lote nenhum.
 * 2. "recipe" — ficha técnica via fastbar_recipe_items, que já existia. Um item com UM insumo só
 *    (quantity=1) é exatamente o "puxar direto de um insumo" pedido: não é um modo à parte, é uma
 *    ficha técnica de uma linha. Editar a ficha depois (getRecipeItems/setRecipeItems, ambos já
 *    existentes) é o mesmo "tudo editável depois"; chamar setRecipeItems com items:[] é o
 *    "desvincular o produto do estoque" — o produto volta a ser 'own', porque a UI de vendas
 *    (fastbar_add_tab_item) usa "tem ficha técnica?" para decidir de onde a venda desconta.
 *
 * Sem controle de validade por regra do módulo — expiresOn no lote continua opcional, como em
 * todo o resto do sistema; não é exigido em nenhum ponto novo aqui.
 */

export type MenuRecipeItem =
  | { type: "base_drink"; baseDrinkId: string; quantity: number }
  | { type: "ingredient"; ingredientId: string; quantity: number };

export type MenuInitialLot = {
  entryMode?: EntryMode | undefined;
  packs?: number | undefined;
  avulsoQuantity?: number | undefined;
  purchaseCost?: number | undefined;
  unitCost?: number | undefined;
  supplierId?: string | undefined;
  expiresOn?: string | undefined;
  note?: string | undefined;
  trace?: LotTraceability | undefined;
};

/**
 * Entrada de estoque PRÓPRIO de um produto (modo "own"), com lote — o equivalente de
 * addBaseDrinkEntry/addIngredientEntry, mas gravando em fastbar_products (stock_quantity,
 * average_cost) e fastbar_stock_movements (que já tem product_id, unit_cost e supplier_id —
 * sempre foi a tabela certa pra isso, só não tinha o lote por trás).
 *
 * entryMode "pacote" usa a embalagem cadastrada no produto (units_per_pack × content_amount);
 * "avulso" ignora essa embalagem e usa a quantidade informada direto — cada lote escolhe o seu,
 * sem travar o produto num formato fixo. purchaseCost (valor total do lote) OU unitCost (valor
 * unitário) — nunca os dois — e o outro é calculado a partir da quantidade resolvida.
 */
export const addProductStockEntry = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      productId: string;
      entryMode?: EntryMode | undefined;
      packs?: number | undefined;
      avulsoQuantity?: number | undefined;
      purchaseCost?: number | undefined;
      unitCost?: number | undefined;
      supplierId?: string | undefined;
      expiresOn?: string | undefined;
      note?: string | undefined;
      trace?: LotTraceability | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    const { resolveEntryQuantity, resolveLotValue, insertStockLot } = await import(
      "./base-drinks.functions"
    );
    await assertRegisterAccess();

    const { data: product } = await admin()
      .from("fastbar_products")
      .select("id, stock_quantity, average_cost, units_per_pack, content_amount")
      .eq("id", data.productId)
      .maybeSingle();
    if (!product) return { ok: false as const, message: "Produto não encontrado." };

    const resolvedQuantity = resolveEntryQuantity({
      mode: data.entryMode,
      packs: data.packs,
      avulsoQuantity: data.avulsoQuantity,
      unitsPerPack: product.units_per_pack,
      contentAmount: Number(product.content_amount),
    });
    if (!resolvedQuantity.ok) return { ok: false as const, message: resolvedQuantity.message };
    const quantity = resolvedQuantity.quantity;

    const value = resolveLotValue({
      quantity,
      totalCost: data.purchaseCost,
      unitCost: data.unitCost,
    });
    if (!value.ok) return { ok: false as const, message: value.message };
    const unitCost = value.unitCost;

    const { error: movementError } = await admin().from("fastbar_stock_movements").insert({
      product_id: product.id,
      quantity,
      movement_type: "in",
      supplier_id: data.supplierId || null,
      unit_cost: unitCost,
      note: data.note?.trim() || null,
    });
    if (movementError) {
      return { ok: false as const, message: "Não foi possível registrar a entrada." };
    }

    const currentStock = Number(product.stock_quantity);
    const currentAvg = Number(product.average_cost);
    const newStock = currentStock + quantity;
    const newAvg =
      unitCost !== null && newStock > 0
        ? (currentStock * currentAvg + quantity * unitCost) / newStock
        : currentAvg;

    const { error: updateError } = await admin()
      .from("fastbar_products")
      .update({ stock_quantity: newStock, average_cost: newAvg })
      .eq("id", product.id);
    if (updateError) {
      return { ok: false as const, message: "Não foi possível atualizar o estoque do produto." };
    }

    await insertStockLot({
      kind: "product",
      componentId: product.id,
      quantity,
      unitCost,
      supplierId: data.supplierId,
      expiresOn: data.expiresOn,
      note: data.note,
      trace: data.trace,
    });

    return { ok: true as const, newStock };
  });

/**
 * Cria um item de cardápio já nascendo com origem de estoque — o "sem vinculação manual
 * separada" do pedido. Um único passo que:
 *  1. cria o produto (reaproveita createProduct, mesma validação de nome/preço/categoria);
 *  2. se veio `recipe` (um insumo ou vários), grava a ficha técnica (reaproveita setRecipeItems);
 *  3. se veio `initialLot`, já lança a primeira entrada de estoque em lote (addProductStockEntry
 *     acima) — a "etapa de lançamento de lote" pedida na parte 2, só que como chamada de backend;
 *     quem constrói a tela decide se abre isso na hora ou depois.
 *
 * `recipe` e `initialLot` são mutuamente exclusivos por natureza (um produto com ficha técnica
 * não tem estoque próprio — quem sofre baixa são os insumos), mas a função não faz um produto
 * pela metade se um dos dois passos falhar: devolve o productId de qualquer forma (o produto já
 * foi criado) junto com o que deu certo/errado em cada etapa, pra quem chamou decidir como
 * reagir — igual ao padrão já usado em confirmarNotaFiscal/confirmarEntradaEstoque.
 */
export const createMenuProduct = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      name: string;
      price: number;
      category: string;
      unit: string;
      packageType?: string | undefined;
      imageUrl?: string | undefined;
      recipe?: MenuRecipeItem[] | undefined;
      initialLot?: MenuInitialLot | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { createProduct, setRecipeItems } = await import("./base-drinks.functions");

    const created = await createProduct({
      data: {
        name: data.name,
        price: data.price,
        category: data.category,
        unit: data.unit,
        packageType: data.packageType,
        imageUrl: data.imageUrl,
      },
    });
    if (!created.ok) return created;
    const productId = created.productId;

    let recipeResult: { ok: boolean; message?: string } | undefined;
    if (data.recipe && data.recipe.length > 0) {
      recipeResult = await setRecipeItems({
        data: {
          productId,
          items: data.recipe.map((item) =>
            item.type === "base_drink"
              ? { type: "base_drink" as const, baseDrinkId: item.baseDrinkId, quantity: item.quantity }
              : { type: "ingredient" as const, ingredientId: item.ingredientId, quantity: item.quantity },
          ),
        },
      });
    }

    // Ficha técnica gravada com sucesso: o produto passa a ser 'recipe', e um lote próprio não
    // faria sentido (quem seria debitado na venda são os insumos, não o produto). Só tenta o lote
    // inicial se ninguém pediu ficha, ou se ela falhou (aí o produto segue 'own' na prática).
    let lotResult: { ok: boolean; message?: string; newStock?: number } | undefined;
    const temFichaValida = !!recipeResult?.ok;
    if (data.initialLot && !temFichaValida) {
      const { addProductStockEntry } = await import("./menu-builder.functions");
      lotResult = await addProductStockEntry({
        data: { productId, ...data.initialLot },
      });
    }

    return {
      ok: true as const,
      productId,
      recipe: recipeResult,
      initialLot: lotResult,
    };
  });

/**
 * Desvincula o produto do estoque atual: apaga a ficha técnica (setRecipeItems com items vazio),
 * devolvendo o produto ao modo "own" — dono do próprio saldo/lotes de novo. Não mexe no que já foi
 * lançado em lote nem no saldo atual; só muda de onde a PRÓXIMA venda vai descontar.
 */
export const unlinkMenuProductRecipe = createServerFn({ method: "POST" })
  .inputValidator((data: { productId: string }) => data)
  .handler(async ({ data }) => {
    const { setRecipeItems } = await import("./base-drinks.functions");
    return setRecipeItems({ data: { productId: data.productId, items: [] } });
  });
