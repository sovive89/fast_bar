import { createServerFn } from "@tanstack/react-start";

/** Public (client-safe) shape — never includes customer_id or other internal/CRM identifiers. */
const PUBLIC_SESSION_COLUMNS =
  "id, customer_name, phone, status, started_at, closed_at, paid_at, discount_percent";

/** Caixa-only shape — internal identifiers ok since it's behind assertRegisterAccess. CPF/RG fica
 * de fora do PUBLIC_SESSION_COLUMNS (link do cliente) porque é dado sensível — só a equipe vê. */
const REGISTER_SESSION_COLUMNS = `${PUBLIC_SESSION_COLUMNS}, customer_id, archived_at, payment_method, document, document_type, pos_order_id, pos_amount, pos_paid_order_id, pos_refunded_at`;

/** Customer view: readable only with the unguessable comanda link, never sensitive columns. */
export const getCustomerTab = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { admin } = await import("./fastbar.server");
    const [{ data: session }, { data: items }] = await Promise.all([
      admin()
        .from("fastbar_sessions")
        .select(PUBLIC_SESSION_COLUMNS)
        .eq("id", data.sessionId)
        .maybeSingle(),
      admin()
        .from("fastbar_tab_items")
        .select("id, session_id, product_id, name, unit_price, quantity, added_at")
        .eq("session_id", data.sessionId)
        .order("added_at"),
    ]);
    return { session: session ?? null, items: items ?? [] };
  });

/** Register view: same payload, but only after the caixa password gate. */
export const getRegisterTab = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const [{ data: session }, { data: items }] = await Promise.all([
      admin()
        .from("fastbar_sessions")
        .select(REGISTER_SESSION_COLUMNS)
        .eq("id", data.sessionId)
        .maybeSingle(),
      admin()
        .from("fastbar_tab_items")
        .select("id, session_id, product_id, name, unit_price, quantity, added_at")
        .eq("session_id", data.sessionId)
        .order("added_at"),
    ]);
    return { session: session ?? null, items: items ?? [] };
  });

export const getRegisterOverview = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const [{ data: sessions }, { data: items }] = await Promise.all([
    admin()
      .from("fastbar_sessions")
      .select(REGISTER_SESSION_COLUMNS)
      .in("status", ["pending", "open", "closed", "paid", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(200),
    admin()
      .from("fastbar_tab_items")
      .select("id, session_id, name, unit_price, quantity, added_at")
      .order("added_at"),
  ]);
  return { sessions: sessions ?? [], items: items ?? [] };
});
