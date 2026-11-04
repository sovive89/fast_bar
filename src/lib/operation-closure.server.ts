/**
 * Fechamento de operação (P1.5-6 do CLAUDE.md / seção 3.4 da documentação funcional): antes de
 * encerrar a operação, toda comanda ainda ABERTA ou FECHADA (aguardando pagamento) precisa receber
 * um destino. Só depois disso a operação pode fechar de verdade.
 *
 * Destinos (decisão do dono em 04/11/2026, docs/DECISOES.md), cada um com um sentido só:
 *
 *   arquivo        comanda SEM saldo devido vai para o Histórico. Com saldo, é recusada.
 *   cortesia       comanda com saldo que o bar decide não cobrar. Motivo obrigatório.
 *   inadimplencia  comanda com saldo que o cliente paga depois. Motivo obrigatório. Reabre quando o
 *                  cliente voltar (debt-reopen.server.ts).
 *   conta_pedida   ação PARCIAL: fecha a conta (aguardando pagamento) sem encerrar a comanda. Ela
 *                  volta a aparecer nos próximos fechamentos até ser paga ou receber outro destino.
 *   mantida_aberta comanda desta operação que continua em uso.
 *
 * Quem aparece: qualquer comanda open/closed, de qualquer operação (ou de nenhuma), que ainda não
 * recebeu destino NESTA operação. Antes só entravam as da operação atual, e as comandas antigas
 * esquecidas abertas (34 em 04/11/2026, R$ 3.129 de saldo) ficavam invisíveis no fechamento.
 * Comandas de operações anteriores (ou sem operação) só aceitam arquivo ou inadimplência: ficar
 * aberta de novo é o que deixou elas esquecidas.
 *
 * Comandas 'pending'/'unverified' (QR ainda não confirmado pela equipe) ficam de fora: ainda não
 * têm consumo, a equipe confirma ou ignora essas pela tela normal do caixa.
 */

export type ClosureDestino =
  "arquivo" | "cortesia" | "inadimplencia" | "conta_pedida" | "mantida_aberta";

export const CLOSURE_DESTINOS: ClosureDestino[] = [
  "arquivo",
  "cortesia",
  "inadimplencia",
  "conta_pedida",
  "mantida_aberta",
];

/** Destinos em que há dinheiro em jogo (perdoar ou deixar dívida): exigem motivo. */
export const DESTINOS_COM_MOTIVO: ClosureDestino[] = ["cortesia", "inadimplencia"];

export interface ClosureCandidate {
  sessionId: string;
  customerName: string;
  status: "open" | "closed";
  /** Saldo devido (total menos o que já foi pago e o crédito consumido). */
  total: number;
  /** Crédito adiantado que ainda sobra na comanda. */
  creditLeft: number;
  /** A comanda é da operação aberta agora (false = operação anterior ou nenhuma). */
  fromCurrentOperation: boolean;
  /** Data operacional da comanda, para mostrar de quando é uma comanda antiga. */
  dataOperacional: string | null;
  /** Destinos que esta comanda aceita, já considerando saldo, status e operação. */
  allowed: ClosureDestino[];
}

type SessionRow = {
  id: string;
  customer_name: string;
  status: string;
  operacao_id: string | null;
  data_operacional?: string | null;
};

/**
 * Regra única de quais destinos uma comanda aceita — usada tanto na lista (para a tela saber o que
 * oferecer) quanto ao gravar (para o servidor recusar o que a tela não deveria ter oferecido).
 */
export function allowedDestinos(params: {
  status: "open" | "closed";
  balance: number;
  creditLeft: number;
  fromCurrentOperation: boolean;
}): ClosureDestino[] {
  const quitada = params.balance <= 0 && params.creditLeft <= 0;
  const owes = params.balance > 0;

  if (!params.fromCurrentOperation) {
    // Comanda antiga: ou sai da lista de vez (arquivo, se quitada) ou vira dívida registrada.
    const allowed: ClosureDestino[] = [];
    if (quitada) allowed.push("arquivo");
    if (owes) allowed.push("inadimplencia");
    // Nada devido mas crédito sobrando: não dá para arquivar (o crédito sumiria) nem há dívida.
    // Sem uma saída, a operação nunca encerraria; fica aberta até a devolução do crédito existir.
    if (allowed.length === 0) allowed.push("mantida_aberta");
    return allowed;
  }

  const allowed: ClosureDestino[] = [];
  if (quitada) allowed.push("arquivo");
  if (owes) allowed.push("cortesia", "inadimplencia");
  // Conta pedida só faz sentido para comanda ainda aberta (uma 'closed' já é conta pedida).
  if (params.status === "open") allowed.push("conta_pedida");
  allowed.push("mantida_aberta");
  return allowed;
}

/** Explica, numa frase, por que um destino não vale para esta comanda. */
function refusalFor(destino: ClosureDestino, candidate: ClosureCandidate): string {
  if (destino === "arquivo") {
    if (candidate.creditLeft > 0) {
      return "Sobrou crédito nesta comanda. Devolva o crédito antes de arquivar.";
    }
    return "Só dá para arquivar comanda sem saldo devido.";
  }
  if (!candidate.fromCurrentOperation) {
    return "Comanda de operação anterior: só arquivo ou inadimplência.";
  }
  if (destino === "cortesia" || destino === "inadimplencia") {
    return "Esta comanda não tem saldo devido.";
  }
  if (destino === "conta_pedida") return "A conta desta comanda já foi pedida.";
  return "Destino inválido para esta comanda.";
}

async function buildCandidate(
  session: SessionRow,
  currentOperationId: string,
): Promise<ClosureCandidate> {
  const { loadSessionBalance } = await import("./session-payments.server");
  const loaded = await loadSessionBalance(session.id);
  const total = loaded?.balance.balance ?? 0;
  const creditLeft = loaded?.balance.creditLeft ?? 0;
  const status = session.status as "open" | "closed";
  const fromCurrentOperation = session.operacao_id === currentOperationId;
  return {
    sessionId: session.id,
    customerName: session.customer_name,
    status,
    total,
    creditLeft,
    fromCurrentOperation,
    dataOperacional: session.data_operacional ?? null,
    allowed: allowedDestinos({ status, balance: total, creditLeft, fromCurrentOperation }),
  };
}

/**
 * Comandas que ainda precisam de um destino nesta operação. É a ausência de linha em
 * fastbar_operation_closures (para ESTA operação) que marca "ainda não revisada" — inclusive para
 * quem ficou como "mantida_aberta" ou "conta_pedida", que não encerram a comanda: sem essa checagem
 * ela voltaria a pedir destino a cada reload. Na operação seguinte, essas voltam a aparecer.
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
      .select("id, customer_name, status, operacao_id, data_operacional")
      .in("status", ["open", "closed"])
      .order("created_at"),
    admin().from("fastbar_operation_closures").select("session_id").eq("operacao_id", operation.id),
  ]);

  const reviewedIds = new Set((reviewed ?? []).map((row) => row.session_id));
  const pending = ((sessions ?? []) as SessionRow[]).filter(
    (session) => !reviewedIds.has(session.id),
  );

  const candidates: ClosureCandidate[] = [];
  for (const session of pending) {
    candidates.push(await buildCandidate(session, operation.id));
  }
  // Desta operação primeiro (é o que a equipe está olhando), as antigas depois.
  candidates.sort((a, b) => Number(b.fromCurrentOperation) - Number(a.fromCurrentOperation));

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

type ResolveResult = { ok: true } | { ok: false; message: string };

export async function resolveClosureCandidate(params: {
  sessionId: string;
  destino: ClosureDestino;
  motivo: string | undefined;
  realizadoPor: string;
}): Promise<ResolveResult> {
  const { admin } = await import("./fastbar.server");
  const { getOpenOperation } = await import("./operations.server");

  if (!CLOSURE_DESTINOS.includes(params.destino)) {
    return { ok: false, message: "Destino inválido." };
  }

  const operation = await getOpenOperation();
  if (!operation) return { ok: false, message: "Não há operação aberta." };

  const motivo = params.motivo?.trim() || "";
  if (DESTINOS_COM_MOTIVO.includes(params.destino) && motivo.length < 5) {
    return { ok: false, message: "Descreva o motivo." };
  }

  const { data: session } = await admin()
    .from("fastbar_sessions")
    .select("id, customer_name, status, operacao_id, data_operacional")
    .eq("id", params.sessionId)
    .maybeSingle();
  if (!session || !["open", "closed"].includes(session.status)) {
    return { ok: false, message: "Comanda inválida para o fechamento." };
  }
  if (await alreadyReviewed(operation.id, session.id)) {
    return { ok: false, message: "Esta comanda já recebeu um destino." };
  }

  const candidate = await buildCandidate(session as SessionRow, operation.id);
  if (!candidate.allowed.includes(params.destino)) {
    return { ok: false, message: refusalFor(params.destino, candidate) };
  }

  const nowIso = new Date().toISOString();
  // Toda mudança de status só vale se a comanda ainda estiver como a lista viu (open/closed): um
  // pagamento ou cancelamento feito no meio do caminho não é atropelado.
  if (params.destino === "arquivo") {
    // Quitada. Com consumo, passa pelo mesmo caminho de "quitar" do caixa (vira "paga" e soma o
    // gasto no CRM, que só é somado quando a comanda é quitada); sem consumo nenhum, vira
    // "cancelada" (nada a faturar). Nos dois casos vai para o Histórico (archived_at).
    const { loadSessionBalance, recordSessionPayment } = await import("./session-payments.server");
    const loaded = await loadSessionBalance(session.id);
    const consumed = loaded?.balance.total ?? 0;
    if (consumed > 0) {
      const lastMethod = loaded?.payments.at(-1)?.method;
      const settled = await recordSessionPayment({
        sessionId: session.id,
        method: (lastMethod ?? "dinheiro") as "dinheiro" | "cartao" | "pix" | "maquininha",
        realizadoPor: params.realizadoPor,
        // Saldo zero nunca é parcial, então a senha não é pedida de novo aqui (já foi na tela).
        authorize: async () => false,
      });
      if (!settled.ok) return { ok: false, message: settled.message };
    } else {
      const { error } = await admin()
        .from("fastbar_sessions")
        .update({ status: "cancelled", closed_at: nowIso })
        .eq("id", session.id)
        .in("status", ["open", "closed"]);
      if (error) return { ok: false, message: "Não foi possível arquivar a comanda." };
    }
    const { error } = await admin()
      .from("fastbar_sessions")
      .update({ archived_at: nowIso })
      .eq("id", session.id);
    if (error) return { ok: false, message: "Não foi possível arquivar a comanda." };
  } else if (params.destino === "cortesia") {
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
  } else if (params.destino === "conta_pedida") {
    // Mesmo efeito do botão "Fechar comanda": carimba a taxa de serviço do momento e conclui um
    // pedido de conta que estivesse em aberto.
    const { loadServiceFeeConfig } = await import("./service-fee.server");
    const fee = await loadServiceFeeConfig();
    const { error } = await admin()
      .from("fastbar_sessions")
      .update({
        status: "closed",
        closed_at: nowIso,
        service_fee_percent: fee.onByDefault ? fee.percent : 0,
      })
      .eq("id", session.id)
      .eq("status", "open");
    if (error) return { ok: false, message: "Não foi possível fechar a conta." };
    const { completeBillRequestsForSession } = await import("./bill-requests.server");
    await completeBillRequestsForSession(session.id, params.realizadoPor);
  }
  // "mantida_aberta": não mexe na comanda — ela segue como estava, pra próxima operação.

  // valor = saldo devido no momento da decisão (o perdoado na cortesia, a dívida na inadimplência, o
  // que fica a receber na conta pedida). Nulo só para "mantida_aberta", que não decide nada ainda.
  const { error: closureError } = await admin()
    .from("fastbar_operation_closures")
    .insert({
      operacao_id: operation.id,
      session_id: session.id,
      session_customer_name: session.customer_name,
      destino: params.destino,
      motivo: motivo || null,
      valor: params.destino === "mantida_aberta" ? null : candidate.total,
      realizado_por: params.realizadoPor,
    });
  if (closureError) {
    // Corrida com outro clique (índice único bateu) — a comanda já foi revisada; não é bug.
    return { ok: false, message: "Esta comanda já recebeu um destino." };
  }

  return { ok: true };
}

/**
 * O mesmo destino para várias comandas de uma vez (caixas de seleção na tela de fechamento). Cada
 * comanda é gravada por conta própria, na ordem: se uma for recusada (ex.: arquivo numa que ainda
 * deve), as outras seguem, e a resposta diz qual falhou e por quê — nada fica pela metade numa
 * comanda só, e a equipe resolve só as que sobraram.
 */
export async function resolveClosureCandidates(params: {
  sessionIds: string[];
  destino: ClosureDestino;
  motivo: string | undefined;
  realizadoPor: string;
}): Promise<{
  ok: boolean;
  done: number;
  failures: { sessionId: string; message: string }[];
}> {
  const uniqueIds = [...new Set(params.sessionIds)];
  const failures: { sessionId: string; message: string }[] = [];
  let done = 0;
  for (const sessionId of uniqueIds) {
    const result = await resolveClosureCandidate({
      sessionId,
      destino: params.destino,
      motivo: params.motivo,
      realizadoPor: params.realizadoPor,
    });
    if (result.ok) done += 1;
    else failures.push({ sessionId, message: result.message });
  }
  return { ok: failures.length === 0 && done > 0, done, failures };
}

/**
 * Fecha a operação só se não sobrar nenhuma comanda sem destino — "não é possível terminar o
 * fluxo sem revisar as comandas abertas" (critério de aceite do CLAUDE.md).
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
