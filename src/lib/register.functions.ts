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

export const removeTabItem = createServerFn({ method: "POST" })
  .inputValidator((data: { itemId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { error } = await admin().from("fastbar_tab_items").delete().eq("id", data.itemId);
    if (error) return { ok: false as const, message: "Não foi possível remover o item." };
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

export const registerPayment = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; method: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess, registerCustomerSpend } = await import(
      "./fastbar.server"
    );
    await assertRegisterAccess();
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
      })
      .eq("id", session.id);
    if (error) return { ok: false as const, message: "Não foi possível registrar o pagamento." };
    await registerCustomerSpend(session.id);
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
