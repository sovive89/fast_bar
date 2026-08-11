import { createServerFn } from "@tanstack/react-start";

export const confirmSession = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { error } = await admin()
      .from("fastbar_sessions")
      .update({ status: "open", started_at: new Date().toISOString() })
      .eq("id", data.sessionId)
      .eq("status", "pending");
    if (error) return { ok: false as const, message: "Não foi possível confirmar a comanda." };
    return { ok: true as const };
  });

export const addTabItem = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; productId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess, registerStockMovement } = await import("./fastbar.server");
    await assertRegisterAccess();
    const [{ data: session }, { data: product }] = await Promise.all([
      admin().from("fastbar_sessions").select("id, status").eq("id", data.sessionId).maybeSingle(),
      admin()
        .from("fastbar_products")
        .select("id, name, price")
        .eq("id", data.productId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
    if (!session || session.status !== "open") {
      return { ok: false as const, message: "Comanda não está aberta." };
    }
    if (!product) return { ok: false as const, message: "Produto indisponível." };
    const { error } = await admin().from("fastbar_tab_items").insert({
      session_id: session.id,
      product_id: product.id,
      name: product.name,
      unit_price: product.price,
      quantity: 1,
    });
    if (error) return { ok: false as const, message: "Não foi possível lançar o item." };
    await registerStockMovement(product.id, session.id, 1);
    return { ok: true as const };
  });

/** Cancela um lançamento feito por engano, devolvendo ao estoque o que ele tinha consumido. */
export const removeTabItem = createServerFn({ method: "POST" })
  .inputValidator((data: { itemId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess, revertStockMovement } = await import("./fastbar.server");
    await assertRegisterAccess();

    const { data: item } = await admin()
      .from("fastbar_tab_items")
      .select("id, product_id, quantity, session_id")
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) return { ok: false as const, message: "Item não encontrado." };

    const { error } = await admin().from("fastbar_tab_items").delete().eq("id", item.id);
    if (error) return { ok: false as const, message: "Não foi possível remover o item." };

    await revertStockMovement(item.product_id, item.session_id, item.quantity);
    return { ok: true as const };
  });

/** Desfaz o último lançamento da comanda — atalho pro erro mais comum no balcão. */
export const undoLastTabItem = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess, revertStockMovement } = await import("./fastbar.server");
    await assertRegisterAccess();

    const { data: item } = await admin()
      .from("fastbar_tab_items")
      .select("id, product_id, quantity, session_id")
      .eq("session_id", data.sessionId)
      .order("added_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!item) return { ok: false as const, message: "Não há lançamentos para desfazer." };

    const { error } = await admin().from("fastbar_tab_items").delete().eq("id", item.id);
    if (error) return { ok: false as const, message: "Não foi possível desfazer o lançamento." };

    await revertStockMovement(item.product_id, item.session_id, item.quantity);
    return { ok: true as const };
  });

/** Remove todos os lançamentos da comanda, devolvendo tudo ao estoque. A comanda continua aberta. */
export const clearTabItems = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess, revertStockMovement } = await import("./fastbar.server");
    await assertRegisterAccess();

    const { data: session } = await admin()
      .from("fastbar_sessions")
      .select("id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) return { ok: false as const, message: "Comanda não encontrada." };
    if (session.status === "paid") {
      return { ok: false as const, message: "Comanda já paga — reabra antes de zerar." };
    }

    const { data: items } = await admin()
      .from("fastbar_tab_items")
      .select("id, product_id, quantity, session_id")
      .eq("session_id", session.id);
    if (!items || items.length === 0) return { ok: true as const, removed: 0 };

    const { error } = await admin().from("fastbar_tab_items").delete().eq("session_id", session.id);
    if (error) return { ok: false as const, message: "Não foi possível zerar a comanda." };

    for (const item of items) {
      await revertStockMovement(item.product_id, item.session_id, item.quantity);
    }
    return { ok: true as const, removed: items.length };
  });

/**
 * Apaga a comanda inteira. Os itens somem junto (FK em cascata), então o estoque é devolvido antes.
 * Irreversível — comanda paga sai do faturamento.
 */
export const deleteSession = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess, revertStockMovement } = await import("./fastbar.server");
    await assertRegisterAccess();

    const { data: items } = await admin()
      .from("fastbar_tab_items")
      .select("id, product_id, quantity, session_id")
      .eq("session_id", data.sessionId);

    for (const item of items ?? []) {
      await revertStockMovement(item.product_id, item.session_id, item.quantity);
    }

    const { error } = await admin().from("fastbar_sessions").delete().eq("id", data.sessionId);
    if (error) return { ok: false as const, message: "Não foi possível apagar a comanda." };
    return { ok: true as const };
  });

export const closeSession = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { error } = await admin()
      .from("fastbar_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", data.sessionId)
      .eq("status", "open");
    if (error) return { ok: false as const, message: "Não foi possível fechar a comanda." };
    return { ok: true as const };
  });

const PAYMENT_METHODS = ["dinheiro", "cartao", "pix"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const registerPayment = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; method: PaymentMethod }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess, registerCustomerSpend } = await import(
      "./fastbar.server"
    );
    await assertRegisterAccess();
    if (!PAYMENT_METHODS.includes(data.method)) {
      return { ok: false as const, message: "Forma de pagamento inválida." };
    }
    const nowIso = new Date().toISOString();
    const { data: session } = await admin()
      .from("fastbar_sessions")
      .select("id, status, closed_at")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session || session.status === "pending") {
      return { ok: false as const, message: "Comanda inválida." };
    }
    const { error } = await admin()
      .from("fastbar_sessions")
      .update({
        status: "paid",
        closed_at: session.closed_at ?? nowIso,
        paid_at: nowIso,
        payment_method: data.method,
      })
      .eq("id", session.id);
    if (error) return { ok: false as const, message: "Não foi possível registrar o pagamento." };
    await registerCustomerSpend(session.id);
    return { ok: true as const };
  });

/**
 * Apaga de vez as comandas já fechadas/pagas até a data informada. O histórico de venda dos itens
 * some junto — relatórios do período deixam de contar essas comandas.
 */
export const purgeClosedSessions = createServerFn({ method: "POST" })
  .inputValidator((data: { before?: string | undefined }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    let query = admin()
      .from("fastbar_sessions")
      .select("id")
      .in("status", ["closed", "paid"]);
    if (data.before) query = query.lt("closed_at", data.before);

    const { data: sessions } = await query;
    if (!sessions || sessions.length === 0) return { ok: true as const, removed: 0 };

    const ids = sessions.map((session) => session.id);
    const { error } = await admin().from("fastbar_sessions").delete().in("id", ids);
    if (error) return { ok: false as const, message: "Não foi possível limpar as comandas." };
    return { ok: true as const, removed: ids.length };
  });

/**
 * Apaga um produto do cardápio de vez. Os itens já vendidos guardam nome e preço próprios, então o
 * histórico e o faturamento continuam corretos — só o vínculo com o produto se perde.
 */
export const deleteProduct = createServerFn({ method: "POST" })
  .inputValidator((data: { productId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { error } = await admin().from("fastbar_products").delete().eq("id", data.productId);
    if (error) {
      return {
        ok: false as const,
        message: "Não foi possível apagar o produto. Ele pode estar em uso numa ficha técnica.",
      };
    }
    return { ok: true as const };
  });

export const reopenSession = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { error } = await admin()
      .from("fastbar_sessions")
      .update({ status: "open", closed_at: null, paid_at: null })
      .eq("id", data.sessionId);
    if (error) return { ok: false as const, message: "Não foi possível reabrir a comanda." };
    return { ok: true as const };
  });
