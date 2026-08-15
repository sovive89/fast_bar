import { createServerFn } from "@tanstack/react-start";

/**
 * As operações de estoque moram em funções no Postgres (migration atomic_stock_operations), onde
 * cada uma roda como transação única e os saldos mudam com `set x = x + n`. Em TypeScript não dá
 * para garantir isso: ler o saldo e gravar depois perde atualizações quando dois pedidos acontecem
 * juntos, e encadear passos sem transação deixa o estoque pela metade se um falhar no meio.
 * Aqui ficam só a autorização e a tradução do código de erro para a mensagem da equipe.
 */
const RPC_MESSAGES: Record<string, string> = {
  session_not_found: "Comanda não encontrada.",
  session_not_open: "Comanda não está aberta.",
  item_not_found: "Item não encontrado.",
  product_unavailable: "Produto indisponível.",
  product_not_found: "Produto não encontrado.",
  no_items: "Não há lançamentos para desfazer.",
  cannot_cancel: "Essa comanda não pode ser cancelada.",
  invalid_quantity: "Informe uma quantidade válida.",
  product_not_configured:
    "Item sem configuração de estoque — defina no Cardápio (ficha técnica ou uma entrada) antes de vender.",
  has_history:
    "Esse produto já tem histórico de vendas ou movimentos de estoque — não dá pra apagar sem perder rastro. Use 'Remover' pra tirar do cardápio sem apagar o histórico.",
};

type RpcResult = { ok: boolean; code?: string; removed?: number; new_quantity?: number };

/** Normaliza o retorno das funções do banco no formato que a UI já espera. */
function fromRpc(
  result: RpcResult | null,
  error: unknown,
  fallback: string,
): { ok: true; removed?: number } | { ok: false; message: string } {
  if (error || !result) return { ok: false, message: fallback };
  if (!result.ok) {
    return { ok: false, message: RPC_MESSAGES[result.code ?? ""] ?? fallback };
  }
  return result.removed === undefined ? { ok: true } : { ok: true, removed: result.removed };
}

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
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { data: result, error } = await admin().rpc("fastbar_add_tab_item", {
      p_session_id: data.sessionId,
      p_product_id: data.productId,
    });
    return fromRpc(result as RpcResult | null, error, "Não foi possível lançar o item.");
  });

/**
 * Cancela um lançamento feito por engano, devolvendo ao estoque o que ele tinha consumido.
 * Só em comanda aberta — depois de fechada/paga, o valor já está no faturamento e mexer aqui
 * desalinharia estoque, faturamento e o total já somado ao cliente no CRM.
 * Exige a senha da equipe de novo (mesma do login do caixa, não uma senha de admin à parte) —
 * protege contra remoção por engano ou por alguém que pegou o caixa destravado sem querer apagar
 * nada. Validado no servidor, não só escondido na UI.
 */
export const removeTabItem = createServerFn({ method: "POST" })
  .inputValidator((data: { itemId: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!teamPasswordMatches(data.password)) {
      return { ok: false as const, message: "Senha incorreta." };
    }
    const { data: result, error } = await admin().rpc("fastbar_remove_tab_item", {
      p_item_id: data.itemId,
    });
    return fromRpc(result as RpcResult | null, error, "Não foi possível remover o item.");
  });

/**
 * Desfaz o último lançamento da comanda — atalho pro erro mais comum no balcão. Só em comanda
 * aberta. Exige senha como as demais remoções: sem isso, bastaria clicar aqui repetidamente para
 * apagar lançamento por lançamento sem senha nenhuma, anulando a proteção de removeTabItem.
 */
export const undoLastTabItem = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!teamPasswordMatches(data.password)) {
      return { ok: false as const, message: "Senha incorreta." };
    }
    const { data: result, error } = await admin().rpc("fastbar_undo_last_tab_item", {
      p_session_id: data.sessionId,
    });
    return fromRpc(result as RpcResult | null, error, "Não foi possível desfazer o lançamento.");
  });

/**
 * Remove todos os lançamentos da comanda, devolvendo tudo ao estoque. Só em comanda aberta.
 * Exige senha da equipe — mesmo padrão de remover item avulso.
 */
export const clearTabItems = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!teamPasswordMatches(data.password)) {
      return { ok: false as const, message: "Senha incorreta." };
    }
    const { data: result, error } = await admin().rpc("fastbar_clear_tab_items", {
      p_session_id: data.sessionId,
    });
    return fromRpc(result as RpcResult | null, error, "Não foi possível zerar a comanda.");
  });

/**
 * Cancela a comanda inteira: devolve ao estoque tudo que tinha sido lançado e marca como
 * cancelada. Uma comanda cancelada nunca vira "paid", então nunca entra no faturamento nem nos
 * relatórios — diferente de "fechar", que é passo normal a caminho do pagamento. Exige senha da
 * equipe (mesma do login do caixa).
 */
export const cancelSession = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!teamPasswordMatches(data.password)) {
      return { ok: false as const, message: "Senha incorreta." };
    }
    const { data: result, error } = await admin().rpc("fastbar_cancel_session", {
      p_session_id: data.sessionId,
    });
    return fromRpc(result as RpcResult | null, error, "Não foi possível cancelar a comanda.");
  });

/**
 * Tira a comanda da lista do caixa sem apagar nada — o histórico continua contando no faturamento
 * e nos relatórios. Só vale para comanda já fechada/paga: comanda aberta ainda está em uso.
 */
export const archiveSession = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const { data: session } = await admin()
      .from("fastbar_sessions")
      .select("id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) return { ok: false as const, message: "Comanda não encontrada." };
    if (!["closed", "paid", "cancelled"].includes(session.status)) {
      return { ok: false as const, message: "Só dá pra arquivar comanda já fechada, paga ou cancelada." };
    }

    const { error } = await admin()
      .from("fastbar_sessions")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", session.id);
    if (error) return { ok: false as const, message: "Não foi possível arquivar a comanda." };
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
    // Cancelada é terminal: aceitar pagamento aqui a jogaria no faturamento, que é exatamente o
    // que o cancelamento existe para impedir. A condição vai no próprio UPDATE, não só no if
    // acima — checar antes e gravar depois deixa uma janela para um cancelamento concorrente
    // entrar no meio e ser sobrescrito.
    if (session.status === "cancelled") {
      return { ok: false as const, message: "Comanda cancelada não pode receber pagamento." };
    }
    const { data: updated, error } = await admin()
      .from("fastbar_sessions")
      .update({
        status: "paid",
        closed_at: session.closed_at ?? nowIso,
        paid_at: nowIso,
        payment_method: data.method,
      })
      .eq("id", session.id)
      .neq("status", "cancelled")
      .select("id");
    if (error) return { ok: false as const, message: "Não foi possível registrar o pagamento." };
    if (!updated || updated.length === 0) {
      return { ok: false as const, message: "Comanda cancelada não pode receber pagamento." };
    }
    // Só credita o gasto no CRM depois de confirmar que o pagamento foi mesmo gravado.
    await registerCustomerSpend(session.id);
    return { ok: true as const };
  });

/**
 * Limpa a tela arquivando de uma vez todas as comandas já fechadas/pagas. Nada é apagado: os
 * valores continuam no faturamento e nos relatórios. Comanda aberta nunca é tocada.
 */
export const archiveClosedSessions = createServerFn({ method: "POST" })
  .inputValidator((data: { before?: string | undefined }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    let query = admin()
      .from("fastbar_sessions")
      .select("id")
      .in("status", ["closed", "paid", "cancelled"])
      .is("archived_at", null);
    if (data.before) query = query.lt("closed_at", data.before);

    const { data: sessions } = await query;
    if (!sessions || sessions.length === 0) return { ok: true as const, archived: 0 };

    const ids = sessions.map((session) => session.id);
    const { error } = await admin()
      .from("fastbar_sessions")
      .update({ archived_at: new Date().toISOString() })
      .in("id", ids);
    if (error) return { ok: false as const, message: "Não foi possível limpar a lista." };
    return { ok: true as const, archived: ids.length };
  });

/** Traz de volta uma comanda arquivada para a lista do caixa. */
export const unarchiveSession = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { error } = await admin()
      .from("fastbar_sessions")
      .update({ archived_at: null })
      .eq("id", data.sessionId);
    if (error) return { ok: false as const, message: "Não foi possível restaurar a comanda." };
    return { ok: true as const };
  });

/**
 * Tira o produto do cardápio sem apagar o cadastro: o histórico de vendas e a ficha técnica
 * continuam intactos, o item só deixa de aparecer para lançamento. Exige senha da equipe como as
 * demais ações destrutivas.
 */
export const deactivateProduct = createServerFn({ method: "POST" })
  .inputValidator((data: { productId: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!teamPasswordMatches(data.password)) {
      return { ok: false as const, message: "Senha incorreta." };
    }
    const { error } = await admin()
      .from("fastbar_products")
      .update({ is_active: false })
      .eq("id", data.productId);
    if (error) return { ok: false as const, message: "Não foi possível remover o produto." };
    return { ok: true as const };
  });

/**
 * Apaga o produto de vez, sem deixar rastro no cardápio. Diferente de "remover" (que só desativa):
 * o número de estoque nunca bloqueia essa ação — a trava real é ter movimento de estoque ou
 * lançamento numa comanda, o que de fato representaria perda de histórico. Sem isso, um cadastro
 * feito por engano (nome errado, categoria errada) fica pra sempre como lixo inativo no banco.
 */
export const deleteProduct = createServerFn({ method: "POST" })
  .inputValidator((data: { productId: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!teamPasswordMatches(data.password)) {
      return { ok: false as const, message: "Senha incorreta." };
    }
    const { data: result, error } = await admin().rpc("fastbar_delete_product", {
      p_product_id: data.productId,
    });
    return fromRpc(result as RpcResult | null, error, "Não foi possível apagar o produto.");
  });

export const reopenSession = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    // Reabrir uma cancelada devolveria ao fluxo normal uma comanda cujos itens já foram apagados e
    // cujo estoque já voltou — e de lá ela poderia ser paga, entrando no faturamento. A condição
    // vai no próprio UPDATE para não abrir janela entre a checagem e a gravação.
    const { data: updated, error } = await admin()
      .from("fastbar_sessions")
      .update({ status: "open", closed_at: null, paid_at: null })
      .eq("id", data.sessionId)
      .neq("status", "cancelled")
      .select("id");
    if (error) return { ok: false as const, message: "Não foi possível reabrir a comanda." };
    if (!updated || updated.length === 0) {
      // Zero linhas tanto significa "estava cancelada" quanto "não existe" — sem distinguir,
      // um id errado acusaria cancelamento e mandaria procurar um problema que não existe.
      const { data: exists } = await admin()
        .from("fastbar_sessions")
        .select("id")
        .eq("id", data.sessionId)
        .maybeSingle();
      return exists
        ? { ok: false as const, message: "Comanda cancelada não pode ser reaberta." }
        : { ok: false as const, message: "Comanda não encontrada." };
    }
    return { ok: true as const };
  });
