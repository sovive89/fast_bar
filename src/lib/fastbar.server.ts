import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { useSession } from "@tanstack/react-start/server";
import { sessionConfig, type GateSession } from "./bar-gate.server";

export const CODE_TTL_MINUTES = 10;

export const generateCode = () => String(Math.floor(100000 + Math.random() * 900000));

export const admin = () => supabaseAdmin;

export async function assertRegisterAccess() {
  const session = await useSession<GateSession>(sessionConfig());
  if (session.data.unlocked !== true) throw new Error("Acesso do caixa não autorizado.");
}

export function sanitizeName(value: unknown) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 3 || name.length > 80) return null;
  if (/\d/.test(name)) return null; // nomes não têm dígitos
  const letters = name.toLowerCase().replace(/[^a-zà-ú]/g, "");
  if (letters.length < 2 || new Set(letters).size < 2) return null; // ex.: "aaaa", "xx"
  return name;
}

export function sanitizePhone(value: unknown) {
  const phone = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (phone.length < 10 || phone.length > 11) return null;
  if (/^(\d)\1+$/.test(phone)) return null; // ex.: 11111111111
  return phone;
}

export async function registerStockMovement(
  productId: string | null,
  sessionId: string,
  quantity: number,
) {
  if (!productId) return;
  await supabaseAdmin.from("fastbar_stock_movements").insert({
    product_id: productId,
    session_id: sessionId,
    quantity,
    movement_type: "out",
    note: "Lançamento na comanda",
  });
  const { data: product } = await supabaseAdmin
    .from("fastbar_products")
    .select("stock_quantity")
    .eq("id", productId)
    .maybeSingle();
  if (product) {
    await supabaseAdmin
      .from("fastbar_products")
      .update({ stock_quantity: Math.max(0, product.stock_quantity - quantity) })
      .eq("id", productId);
  }
  // Se o produto tem ficha técnica (ex.: "Caipirinha"), desconta os componentes em ml/un.
  await deductRecipeComponentsForSale(productId, quantity);
}

/**
 * Devolve ao estoque o que um lançamento tinha consumido. Usado quando a equipe cancela um item
 * lançado por engano — sem isso o produto sairia do estoque e nunca voltaria.
 */
export async function revertStockMovement(
  productId: string | null,
  sessionId: string,
  quantity: number,
) {
  if (!productId) return;
  await supabaseAdmin.from("fastbar_stock_movements").insert({
    product_id: productId,
    session_id: sessionId,
    quantity,
    movement_type: "in",
    note: "Cancelamento de lançamento",
  });
  const { data: product } = await supabaseAdmin
    .from("fastbar_products")
    .select("stock_quantity")
    .eq("id", productId)
    .maybeSingle();
  if (product) {
    await supabaseAdmin
      .from("fastbar_products")
      .update({ stock_quantity: product.stock_quantity + quantity })
      .eq("id", productId);
  }
  await restoreRecipeComponents(productId, quantity);
}

/** Baixa automática: 1 venda do produto consome os componentes (bebidas base + ingredientes) da ficha técnica. */
export async function deductRecipeComponentsForSale(productId: string, saleQuantity: number) {
  const { data: recipeItems } = await supabaseAdmin
    .from("fastbar_recipe_items")
    .select("base_drink_id, ingredient_id, quantity")
    .eq("product_id", productId);
  if (!recipeItems || recipeItems.length === 0) return; // produto sem ficha técnica (ex.: cerveja lata)

  for (const item of recipeItems) {
    const consumed = Number(item.quantity) * saleQuantity;

    if (item.base_drink_id) {
      const { data: baseDrink } = await supabaseAdmin
        .from("fastbar_base_drinks")
        .select("id, current_stock")
        .eq("id", item.base_drink_id)
        .maybeSingle();
      if (!baseDrink) continue;

      await supabaseAdmin.from("fastbar_base_drink_movements").insert({
        base_drink_id: baseDrink.id,
        type: "saida",
        quantity: consumed,
        reason: "venda",
        note: "Baixa automática por venda",
      });
      await supabaseAdmin
        .from("fastbar_base_drinks")
        .update({ current_stock: Math.max(0, Number(baseDrink.current_stock) - consumed) })
        .eq("id", baseDrink.id);
      continue;
    }

    if (item.ingredient_id) {
      const { data: ingredient } = await supabaseAdmin
        .from("fastbar_drink_ingredients")
        .select("id, current_stock")
        .eq("id", item.ingredient_id)
        .maybeSingle();
      if (!ingredient) continue;

      await supabaseAdmin.from("fastbar_drink_ingredient_movements").insert({
        ingredient_id: ingredient.id,
        type: "saida",
        quantity: consumed,
        reason: "venda",
        note: "Baixa automática por venda",
      });
      await supabaseAdmin
        .from("fastbar_drink_ingredients")
        .update({ current_stock: Math.max(0, Number(ingredient.current_stock) - consumed) })
        .eq("id", ingredient.id);
    }
  }
}

/** Inverso de deductRecipeComponentsForSale: devolve os componentes da ficha técnica ao estoque. */
export async function restoreRecipeComponents(productId: string, saleQuantity: number) {
  const { data: recipeItems } = await supabaseAdmin
    .from("fastbar_recipe_items")
    .select("base_drink_id, ingredient_id, quantity")
    .eq("product_id", productId);
  if (!recipeItems || recipeItems.length === 0) return;

  for (const item of recipeItems) {
    const restored = Number(item.quantity) * saleQuantity;

    if (item.base_drink_id) {
      const { data: baseDrink } = await supabaseAdmin
        .from("fastbar_base_drinks")
        .select("id, current_stock")
        .eq("id", item.base_drink_id)
        .maybeSingle();
      if (!baseDrink) continue;

      await supabaseAdmin.from("fastbar_base_drink_movements").insert({
        base_drink_id: baseDrink.id,
        type: "entrada",
        quantity: restored,
        reason: "cancelamento",
        note: "Estorno por cancelamento de lançamento",
      });
      await supabaseAdmin
        .from("fastbar_base_drinks")
        .update({ current_stock: Number(baseDrink.current_stock) + restored })
        .eq("id", baseDrink.id);
      continue;
    }

    if (item.ingredient_id) {
      const { data: ingredient } = await supabaseAdmin
        .from("fastbar_drink_ingredients")
        .select("id, current_stock")
        .eq("id", item.ingredient_id)
        .maybeSingle();
      if (!ingredient) continue;

      await supabaseAdmin.from("fastbar_drink_ingredient_movements").insert({
        ingredient_id: ingredient.id,
        type: "entrada",
        quantity: restored,
        reason: "cancelamento",
        note: "Estorno por cancelamento de lançamento",
      });
      await supabaseAdmin
        .from("fastbar_drink_ingredients")
        .update({ current_stock: Number(ingredient.current_stock) + restored })
        .eq("id", ingredient.id);
    }
  }
}

/** Cria o cliente na primeira visita, ou atualiza nome/última visita/contagem numa nova visita. */
export async function upsertCustomer(name: string, phone: string): Promise<string> {
  const nowIso = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from("fastbar_customers")
    .select("id, total_visits")
    .eq("phone", phone)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("fastbar_customers")
      .update({ name, last_seen_at: nowIso, total_visits: existing.total_visits + 1 })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: inserted } = await supabaseAdmin
    .from("fastbar_customers")
    .insert({ name, phone, total_visits: 1, first_seen_at: nowIso, last_seen_at: nowIso })
    .select("id")
    .single();

  return inserted!.id;
}

/** Soma o consumo da comanda paga no total histórico do cliente. */
export async function registerCustomerSpend(sessionId: string) {
  const { data: session } = await supabaseAdmin
    .from("fastbar_sessions")
    .select("customer_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session?.customer_id) return;

  const { data: items } = await supabaseAdmin
    .from("fastbar_tab_items")
    .select("unit_price, quantity")
    .eq("session_id", sessionId);

  const total = (items ?? []).reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  if (total <= 0) return;

  const { data: customer } = await supabaseAdmin
    .from("fastbar_customers")
    .select("total_spent")
    .eq("id", session.customer_id)
    .maybeSingle();
  if (!customer) return;

  await supabaseAdmin
    .from("fastbar_customers")
    .update({ total_spent: Number(customer.total_spent) + total })
    .eq("id", session.customer_id);
}
