/**
 * Fechamento de operação (P1.5-6 do CLAUDE.md / seção 3.4 da documentação funcional): antes de
 * encerrar a operação, toda comanda ainda ABERTA ou FECHADA (aguardando pagamento) vinculada a
 * ela precisa receber um destino — cortesia, inadimplência, ou manter aberta — com senha e, exceto
 * para "manter aberta", motivo. Só depois disso a operação pode fechar de verdade.
 *
 * Limitação conhecida desta entrega: a lista de candidatas cobre comandas com operacao_id igual à
 * operação aberta agora. Comandas 'pending'/'unverified' (QR do cliente ainda não confirmado pela
 * equipe) ficam de fora de propósito — ainda não têm consumo/valor associado, então "cortesia" ou
 * "inadimplência" não fazem sentido pra elas; a equipe confirma ou ignora essas pela tela normal
 * do caixa, como já fazia antes.
 */

export type ClosureDestino = "cortesia" | "inadimplencia" | "mantida_aberta";

export interface ClosureCandidate {
  sessionId: string;
  customerName: string;
  status: "open" | "closed";
  total: number;
}

/**
 * Comandas que ainda precisam de um destino nesta operação: status open/closed, vinculadas à
 * operação aberta agora, e que AINDA NÃO têm uma linha em fastbar_operation_closures pra essa
 * operação — é essa ausência de linha que marca "ainda não revisada", inclusive pra quem foi
 * resolvida como "mantida_aberta" (que não muda o status da comanda, então sem essa checagem ela
 * voltaria a aparecer pedindo destino de novo a cada reload).
 */
export async function listClosureCandidates(): Promise<{
  operationId: string | null;
  candidates: ClosureCandidate[];
}> {
  const { admin } = await import("./fastbar.server");
  const { getOpenOperation } = await import("./operations.server");

  const operation = await getOpenOperation();
  if (!operation) return { operationId: null, candidates: [] };

  const [{ data: sessions }, { data: reviewed }] = await Promise.all([
    admin()
      .from("fastbar_sessions")
      .select("id, customer_name, status")
      .eq("operacao_id", operation.id)
      .in("status", ["open", "closed"]),
    admin().from("fastbar_operation_closures").select("session_id").eq("operacao_id", operation.id),
  ]);

  const reviewedIds = new Set((reviewed ?? []).map((row) => row.session_id));
  const pending = (sessions ?? []).filter((session) => !reviewedIds.has(session.id));
  if (pending.length === 0) return { operationId: operation.id, candidates: [] };

  const { data: items } = await admin()
    .from("fastbar_tab_items")
    .select("session_id, unit_price, quantity")
    .in(
      "session_id",
      pending.map((session) => session.id),
    );

  const { tabTotals } = await import("@/services/supabase/tabItems");
  const itemsBySession = new Map<string, { unit_price: number; quantity: number }[]>();
  for (const item of items ?? []) {
    const list = itemsBySession.get(item.session_id) ?? [];
    list.push({ unit_price: item.unit_price, quantity: item.quantity });
    itemsBySession.set(item.session_id, list);
  }

  const candidates: ClosureCandidate[] = pending.map((session) => ({
    sessionId: session.id,
    customerName: session.customer_name,
    status: session.status as "open" | "closed",
    total: tabTotals(itemsBySession.get(session.id) ?? [], 0, 0).total,
  }));

  return { operationId: operation.id, candidates };
}

/** Confere se a comanda já foi revisada nesta operação (índice único faz a mesma checagem no
 * banco; isto só evita gastar um insert quando já dá pra saber antes). */
async function alreadyReviewed(operationId: string, sessionId: string): Promise<boolean> {
  const { admin } = await import("./fastbar.server");
  const { data } = await admin()
    .from("fastbar_operation_closures")
    .select("id")
    .eq("operacao_id", operationId)
    .eq("session_id", sessionId)
    .maybeSingle();
  return Boolean(data);
}

export async function resolveClosureCandidate(params: {
  sessionId: string;
  destino: ClosureDestino;
  motivo: string | undefined;
  realizadoPor: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { admin } = await import("./fastbar.server");
  const { getOpenOperation } = await import("./operations.server");

  const operation = await getOpenOperation();
  if (!operation) return { ok: false, message: "Não há operação aberta." };

  const motivo = params.motivo?.trim() || "";
  if (params.destino !== "mantida_aberta" && motivo.length < 5) {
    return { ok: false, message: "Descreva o motivo." };
  }

  const { data: session } = await admin()
    .from("fastbar_sessions")
    .select("id, customer_name, status, operacao_id")
    .eq("id", params.sessionId)
    .maybeSingle();
  if (
    !session ||
    session.operacao_id !== operation.id ||
    !["open", "closed"].includes(session.status)
  ) {
    return { ok: false, message: "Comanda inválida para esta operação." };
  }
  if (await alreadyReviewed(operation.id, session.id)) {
    return { ok: false, message: "Esta comanda já recebeu um destino." };
  }

  const { data: items } = await admin()
    .from("fastbar_tab_items")
    .select("unit_price, quantity")
    .eq("session_id", session.id);
  const { tabTotals } = await import("@/services/supabase/tabItems");
  const total = tabTotals(items ?? [], 0, 0).total;

  const nowIso = new Date().toISOString();
  if (params.destino === "cortesia") {
    const { error } = await admin()
      .from("fastbar_sessions")
      .update({ status: "cortesia", closed_at: nowIso })
      .eq("id", session.id)
      .in("status", ["open", "closed"]);
    if (error) return { ok: false, message: "Não foi possível fechar como cortesia." };
  } else if (params.destino === "inadimplencia") {
    const { error } = await admin()
      .from("fastbar_sessions")
      .update({ status: "inadimplente", closed_at: nowIso })
      .eq("id", session.id)
      .in("status", ["open", "closed"]);
    if (error) return { ok: false, message: "Não foi possível enviar à inadimplência." };
  }
  // "mantida_aberta": não mexe na comanda — ela segue como estava, pra próxima operação.

  const { error: closureError } = await admin()
    .from("fastbar_operation_closures")
    .insert({
      operacao_id: operation.id,
      session_id: session.id,
      session_customer_name: session.customer_name,
      destino: params.destino,
      motivo: params.destino === "mantida_aberta" ? null : motivo,
      valor: params.destino === "mantida_aberta" ? null : total,
      realizado_por: params.realizadoPor,
    });
  if (closureError) {
    // Corrida com outro clique (índice único bateu) — a comanda já foi revisada; não é bug.
    return { ok: false, message: "Esta comanda já recebeu um destino." };
  }

  return { ok: true };
}

/**
 * Fecha a operação só se não sobrar nenhuma comanda sem destino — "não é possível terminar o
 * fluxo sem revisar as comandas abertas" (critério de aceite do CLAUDE.md). O resto é idêntico ao
 * fechamento antigo (operations.server.ts não tinha essa trava; closeOperation em
 * operations.functions.ts ainda existe e continua funcionando sozinho, mas a UI agora sempre passa
 * por aqui primeiro).
 */
export async function closeOperationWithReview(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const { admin } = await import("./fastbar.server");
  const { getOpenOperation } = await import("./operations.server");

  const operation = await getOpenOperation();
  if (!operation) return { ok: false, message: "Não há operação aberta." };

  const { candidates } = await listClosureCandidates();
  if (candidates.length > 0) {
    return {
      ok: false,
      message: `Ainda há ${candidates.length} comanda${candidates.length === 1 ? "" : "s"} sem destino definido.`,
    };
  }

  const now = new Date();
  const { error } = await admin()
    .from("fastbar_operations")
    .update({ status: "FECHADA", fechado_em: now.toISOString(), fechado_por: "equipe" })
    .eq("id", operation.id)
    .eq("status", "ABERTA");
  if (error) return { ok: false, message: "Não foi possível encerrar a operação." };
  return { ok: true };
}
