/**
 * Reabertura de comanda inadimplente quando o cliente volta ao bar (decisão do dono em 04/11/2026,
 * docs/DECISOES.md): em vez de abrir uma comanda nova e deixar a dívida esquecida na aba
 * Inadimplentes, o mesmo cliente (mesmo celular, ou mesmo documento quando é a equipe que abre)
 * volta para a comanda que ficou devendo. Itens e livro de pagamentos continuam intactos: reabrir
 * não apaga a dívida (P2 do CLAUDE.md), e o saldo antigo é cobrado junto com o consumo novo.
 *
 * Cada reabertura grava uma linha em fastbar_session_reopenings (quando, em qual operação, por
 * quem e quanto devia) — é a trilha de auditoria dessa mudança de status.
 *
 * Mais de uma comanda inadimplente para o mesmo cliente: reabre a mais recente. As outras seguem
 * na aba Inadimplentes, para a equipe decidir (o caso é raro e juntar contas é outro recurso).
 */

export type ReopenTarget = "unverified" | "pending" | "open";

export async function reopenDebtSession(params: {
  phone: string | null;
  document: string | null;
  /** Para onde a comanda volta: o fluxo do QR segue as mesmas etapas de uma comanda nova
   * (verificar o celular, depois a equipe confirma); a equipe abrindo no caixa já vai para "open". */
  toStatus: ReopenTarget;
  realizadoPor: "cliente" | "equipe";
}): Promise<{ sessionId: string; saldo: number } | null> {
  if (!params.phone && !params.document) return null;

  const { admin } = await import("./fastbar.server");
  const { getOpenOperation, loadOperationConfig, computeDataOperacional } =
    await import("./operations.server");

  const operation = await getOpenOperation();
  // Sem operação aberta não se reabre nada: a comanda reaberta precisa pertencer a uma operação,
  // igual a uma comanda nova (quem chama já recusa abrir comanda sem operação).
  if (!operation) return null;

  let query = admin().from("fastbar_sessions").select("id").eq("status", "inadimplente");
  query = params.phone ? query.eq("phone", params.phone) : query.eq("document", params.document!);
  const { data: debt } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!debt) return null;

  const { loadSessionBalance } = await import("./session-payments.server");
  const saldo = (await loadSessionBalance(debt.id))?.balance.balance ?? 0;

  const config = await loadOperationConfig();
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await admin()
    .from("fastbar_sessions")
    .update({
      status: params.toStatus,
      closed_at: null,
      paid_at: null,
      archived_at: null,
      operacao_id: operation.id,
      data_operacional: computeDataOperacional(new Date(), config),
      ...(params.toStatus === "open" ? { started_at: nowIso } : {}),
    })
    .eq("id", debt.id)
    // Só reabre se continuar inadimplente: um pagamento registrado no mesmo instante ganha.
    .eq("status", "inadimplente")
    .select("id");
  if (error || !updated || updated.length === 0) return null;

  await admin().from("fastbar_session_reopenings").insert({
    session_id: debt.id,
    operacao_id: operation.id,
    status_anterior: "inadimplente",
    saldo,
    motivo: "retorno do cliente",
    realizado_por: params.realizadoPor,
  });

  return { sessionId: debt.id, saldo };
}
