/**
 * Apagar o cliente do CRM (dados pessoais), sem apagar o que ele consumiu.
 *
 * O que some: o cadastro em fastbar_customers (nome, celular, documento, aniversário, perfil,
 * consentimento) e os dados pessoais copiados para as comandas dele (nome, celular, documento).
 * O que fica: as comandas, itens, pagamentos e fechamentos, agora sem identificar a pessoa. Se ela
 * voltar, é cadastrada de novo como cliente novo (primeira visita).
 *
 * Não apaga cliente com comanda ainda em andamento: mexer no nome no meio do atendimento confunde
 * a equipe. A operação é repetível: se parar no meio, basta apagar de novo.
 */
export type ErasureResult = { ok: true; sessions: number } | { ok: false; message: string };

export const REMOVED_CUSTOMER_NAME = "Cliente removido";
// Sem dígitos de propósito: nenhuma busca por celular encontra este valor. A tabela exige celular
// ou documento preenchido, por isso a comanda guarda este marcador em vez de ficar vazia.
const REMOVED_PHONE_MARKER = "removido";
const ACTIVE_STATUSES = ["unverified", "pending", "open"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function eraseCustomer(customerId: string, password: unknown): Promise<ErasureResult> {
  const { assertRole } = await import("./staff-users.server");
  const actor = await assertRole("admin");
  if (typeof customerId !== "string" || !UUID.test(customerId))
    return { ok: false, message: "Cliente inválido." };
  const { teamPasswordMatches } = await import("./bar-gate.server");
  if (!(await teamPasswordMatches(password))) return { ok: false, message: "Senha incorreta." };

  const { admin, getDefaultTenantId } = await import("./fastbar.server");
  const db = admin();
  const tenantId = await getDefaultTenantId();

  const { data: customer } = await db
    .from("fastbar_customers")
    .select("id, phone, document")
    .eq("tenant_id", tenantId)
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) return { ok: false, message: "Esse cliente já não existe." };

  // Comandas do cliente: pelo vínculo, e também as que só guardam o mesmo celular ou documento.
  const found = new Map<string, string>();
  const collect = async (column: "customer_id" | "phone" | "document", value: string | null) => {
    if (!value) return;
    const { data, error } = await db
      .from("fastbar_sessions")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq(column, value);
    if (error) throw new Error("Não foi possível consultar as comandas do cliente.");
    for (const row of data ?? []) found.set(row.id, row.status);
  };
  try {
    await collect("customer_id", customer.id);
    await collect("phone", customer.phone);
    await collect("document", customer.document);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  if ([...found.values()].some((status) => ACTIVE_STATUSES.includes(status)))
    return {
      ok: false,
      message: "Este cliente tem comanda em andamento. Feche ou cancele antes de apagar.",
    };

  const sessionIds = [...found.keys()];
  if (sessionIds.length > 0) {
    const { error: sessionError } = await db
      .from("fastbar_sessions")
      .update({
        customer_id: null,
        customer_name: REMOVED_CUSTOMER_NAME,
        phone: REMOVED_PHONE_MARKER,
        document: null,
        document_type: null,
      })
      .in("id", sessionIds);
    if (sessionError)
      return { ok: false, message: "Não foi possível apagar os dados das comandas." };
    const { error: closureError } = await db
      .from("fastbar_operation_closures")
      .update({ session_customer_name: REMOVED_CUSTOMER_NAME })
      .in("session_id", sessionIds);
    if (closureError)
      return { ok: false, message: "Não foi possível apagar os dados dos fechamentos." };
  }

  const { error: deleteError } = await db
    .from("fastbar_customers")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", customerId);
  if (deleteError) return { ok: false, message: "Não foi possível apagar o cadastro do cliente." };

  try {
    await db.from("fastbar_staff_audit").insert({
      tenant_id: tenantId,
      actor: actor.staffId ?? "legado",
      action: "cliente_apagado",
      target_id: customerId,
    });
  } catch {
    /* O cadastro já foi apagado. */
  }
  return { ok: true, sessions: sessionIds.length };
}
