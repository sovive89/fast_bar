import { createServerFn } from "@tanstack/react-start";

/** Public (client-safe) shape — never includes customer_id or other internal/CRM identifiers. */
const PUBLIC_SESSION_COLUMNS =
  "id, customer_name, phone, status, started_at, closed_at, paid_at, discount_percent, service_fee_percent";

/** Caixa-only shape — internal identifiers ok since it's behind assertRegisterAccess. CPF/RG fica
 * de fora do PUBLIC_SESSION_COLUMNS (link do cliente) porque é dado sensível — só a equipe vê. */
const REGISTER_SESSION_COLUMNS = `${PUBLIC_SESSION_COLUMNS}, customer_id, archived_at, operacao_id, payment_method, document, document_type, pos_order_id, pos_amount, pos_paid_order_id, pos_refunded_at`;

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
    const [{ data: session }, { data: items }, { data: payments }, { data: credits }] =
      await Promise.all([
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
      // Recebimentos já feitos nesta comanda (pagamento parcial): a tela mostra o saldo que falta.
      admin()
        .from("fastbar_session_payments")
        .select("id, amount, method, motivo, saldo_apos, created_at")
        .eq("session_id", data.sessionId)
        .order("created_at"),
      admin()
        .from("fastbar_session_credits")
        .select("id, amount, method, created_at")
        .eq("session_id", data.sessionId)
        .order("created_at"),
    ]);
    return {
      session: session ?? null,
      items: items ?? [],
      payments: (payments ?? []).map((payment) => ({ ...payment, amount: Number(payment.amount) })),
      credits: (credits ?? []).map((credit) => ({ ...credit, amount: Number(credit.amount) })),
    };
  });

export const getRegisterOverview = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const [{ data: sessions }, { data: items }] = await Promise.all([
    admin()
      .from("fastbar_sessions")
      .select(REGISTER_SESSION_COLUMNS)
      // cortesia e inadimplente precisam estar aqui: sem eles as comandas resolvidas no fechamento
      // da operação sumiriam da lista, e a aba "Inadimplentes" ficaria sempre vazia.
      .in("status", ["pending", "open", "closed", "paid", "cancelled", "cortesia", "inadimplente"])
      .order("created_at", { ascending: false })
      .limit(200),
    admin()
      .from("fastbar_tab_items")
      .select("id, session_id, name, unit_price, quantity, added_at")
      .order("added_at"),
  ]);
  // A operação em andamento define o que é "Fechadas nesta operação" e o que já é "Histórico".
  const { getOpenOperation } = await import("./operations.server");
  const operation = await getOpenOperation();
  return {
    sessions: sessions ?? [],
    items: items ?? [],
    currentOperationId: operation?.id ?? null,
  };
});
