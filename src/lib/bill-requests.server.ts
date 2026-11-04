/**
 * Pedido de conta pelo celular (P2 do CLAUDE.md): o cliente pede, a equipe é avisada no caixa.
 *
 * O pedido SÓ AVISA — nunca fecha a comanda nem mexe em valor. Fechar e cobrar continuam sendo da
 * equipe, pelo fluxo normal. Estados: pedida → em_atendimento → concluida, cada passo com horário e
 * quem fez. No máximo um pedido ativo por comanda (índice único no banco; a checagem aqui só dá a
 * mensagem certa sem gastar um insert).
 */

export type BillRequestStatus = "pedida" | "em_atendimento" | "concluida";

export type RequestBillResult =
  | { ok: true; status: "pedida" | "em_atendimento"; alreadyRequested: boolean }
  | { ok: false; message: string };

/** Pedido ativo (ainda não concluído) de uma comanda, ou null. */
export async function getActiveBillRequest(
  sessionId: string,
): Promise<{ id: string; status: "pedida" | "em_atendimento" } | null> {
  const { admin } = await import("./fastbar.server");
  const { data } = await admin()
    .from("fastbar_bill_requests")
    .select("id, status")
    .eq("session_id", sessionId)
    .in("status", ["pedida", "em_atendimento"])
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, status: data.status as "pedida" | "em_atendimento" };
}

/**
 * O cliente pede a conta. Só vale para comanda ABERTA (já fechada, paga ou cancelada não tem o que
 * pedir) e é idempotente: pedir de novo devolve o pedido que já existe, sem gerar outro alerta.
 */
export async function requestBill(sessionId: string): Promise<RequestBillResult> {
  const { admin } = await import("./fastbar.server");

  const { data: session } = await admin()
    .from("fastbar_sessions")
    .select("id, status, customer_name")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false, message: "Comanda não encontrada." };
  if (session.status !== "open") {
    return {
      ok: false,
      message:
        session.status === "closed"
          ? "Sua conta já foi pedida: a equipe vai trazer."
          : "Essa comanda não está aberta.",
    };
  }

  const existing = await getActiveBillRequest(sessionId);
  if (existing) return { ok: true, status: existing.status, alreadyRequested: true };

  const { error } = await admin()
    .from("fastbar_bill_requests")
    .insert({ session_id: sessionId, status: "pedida" });
  if (error) {
    // Dois toques quase juntos: o índice único barrou o segundo. O pedido existe — é sucesso.
    const raced = await getActiveBillRequest(sessionId);
    if (raced) return { ok: true, status: raced.status, alreadyRequested: true };
    return { ok: false, message: "Não foi possível avisar a equipe agora. Tente de novo." };
  }

  // Avisa o celular da equipe mesmo com o app fechado. Só no pedido NOVO (não no toque repetido) e
  // nunca falha o pedido: se o push não sair, o alerta dentro do caixa continua valendo.
  try {
    const { notifyStaff } = await import("./push.server");
    const firstName = (session.customer_name ?? "").trim().split(/\s+/)[0] || "Um cliente";
    await notifyStaff({
      kind: "conta",
      title: "Pedido de conta",
      body: `${firstName} pediu a conta`,
      url: `/caixa/${sessionId}`,
      tag: `conta-${sessionId}`,
    });
  } catch (error) {
    console.error("[bill-requests] push não saiu", (error as Error).message);
  }

  return { ok: true, status: "pedida", alreadyRequested: false };
}

export interface ActiveBillRequest {
  id: string;
  sessionId: string;
  customerName: string;
  status: "pedida" | "em_atendimento";
  createdAt: string;
}

/** Pedidos ainda sem conclusão, os mais antigos primeiro — é o que o banner do caixa mostra. */
export async function listActiveBillRequests(): Promise<ActiveBillRequest[]> {
  const { admin } = await import("./fastbar.server");
  const { data: requests } = await admin()
    .from("fastbar_bill_requests")
    .select("id, session_id, status, created_at")
    .in("status", ["pedida", "em_atendimento"])
    .order("created_at");
  if (!requests || requests.length === 0) return [];

  const { data: sessions } = await admin()
    .from("fastbar_sessions")
    .select("id, customer_name")
    .in(
      "id",
      requests.map((request) => request.session_id),
    );
  const nameById = new Map((sessions ?? []).map((session) => [session.id, session.customer_name]));

  return requests.map((request) => ({
    id: request.id,
    sessionId: request.session_id,
    customerName: nameById.get(request.session_id) ?? "Cliente",
    status: request.status as "pedida" | "em_atendimento",
    createdAt: request.created_at,
  }));
}

/**
 * A equipe assume ("atender": pedida → em_atendimento) ou conclui ("concluir": qualquer ativo →
 * concluida). A condição de status vai no próprio UPDATE: dois caixas tocando ao mesmo tempo não
 * sobrescrevem um ao outro.
 */
export async function advanceBillRequest(params: {
  requestId: string;
  action: "atender" | "concluir";
  realizadoPor: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { admin } = await import("./fastbar.server");
  const nowIso = new Date().toISOString();

  const query =
    params.action === "atender"
      ? admin()
          .from("fastbar_bill_requests")
          .update({
            status: "em_atendimento",
            attended_at: nowIso,
            attended_by: params.realizadoPor,
          })
          .eq("id", params.requestId)
          .eq("status", "pedida")
      : admin()
          .from("fastbar_bill_requests")
          .update({ status: "concluida", completed_at: nowIso, completed_by: params.realizadoPor })
          .eq("id", params.requestId)
          .in("status", ["pedida", "em_atendimento"]);

  const { data, error } = await query.select("id");
  if (error) return { ok: false, message: "Não foi possível atualizar o pedido." };
  if (!data || data.length === 0) {
    return { ok: false, message: "Esse pedido já foi atendido por outra pessoa." };
  }
  return { ok: true };
}

/** Conclui o pedido ativo de uma comanda — chamado quando a equipe fecha a comanda, que é a
 * resposta natural a "o cliente pediu a conta". */
export async function completeBillRequestsForSession(
  sessionId: string,
  realizadoPor: string,
): Promise<void> {
  const { admin } = await import("./fastbar.server");
  await admin()
    .from("fastbar_bill_requests")
    .update({
      status: "concluida",
      completed_at: new Date().toISOString(),
      completed_by: realizadoPor,
    })
    .eq("session_id", sessionId)
    .in("status", ["pedida", "em_atendimento"]);
}
