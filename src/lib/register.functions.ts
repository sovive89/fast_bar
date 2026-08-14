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
    const { admin, assertRegisterAccess, revertStockMovement } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!teamPasswordMatches(data.password)) {
      return { ok: false as const, message: "Senha incorreta." };
    }

    const { data: item } = await admin()
      .from("fastbar_tab_items")
      .select("id, product_id, quantity, session_id, fastbar_sessions(status)")
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) return { ok: false as const, message: "Item não encontrado." };
    const session = item.fastbar_sessions as { status: string } | { status: string }[] | null;
    const status = Array.isArray(session) ? session[0]?.status : session?.status;
    if (status !== "open") {
      return { ok: false as const, message: "Comanda não está aberta." };
    }

    // Apaga primeiro e só estorna se este request foi quem de fato removeu a linha. Estornar antes
    // parecia mais seguro, mas não é: dois requests simultâneos (duplo clique, retry de rede) leem
    // o mesmo item, estornam os dois e creditam o estoque em dobro. O delete condicional deixa
    // exatamente um vencedor, e é o estoque que precisa fechar no fim do dia.
    //
    // O troco desta escolha: se o processo morrer entre o delete e o estorno, o item some sem o
    // estoque voltar. Preferido ao inverso porque duplo clique é corriqueiro no balcão e queda de
    // processo é rara, e porque estoque a mais (vender o que não existe) machuca mais que estoque a
    // menos. Resolver de verdade exige transação — os dois passos numa função no Postgres.
    const { data: deleted, error } = await admin()
      .from("fastbar_tab_items")
      .delete()
      .eq("id", item.id)
      .select("id");
    if (error) return { ok: false as const, message: "Não foi possível remover o item." };
    if (!deleted || deleted.length === 0) {
      // Outro request já removeu: o estorno dele já aconteceu, então aqui não há o que fazer.
      return { ok: true as const };
    }

    const reverted = await revertStockMovement(item.product_id, item.session_id, item.quantity);
    if (!reverted.ok) {
      return { ok: false as const, message: "Item removido, mas o estoque não voltou — confira o estoque." };
    }
    return { ok: true as const };
  });

/**
 * Desfaz o último lançamento da comanda — atalho pro erro mais comum no balcão. Só em comanda
 * aberta. Exige senha como as demais remoções: sem isso, bastaria clicar aqui repetidamente para
 * apagar lançamento por lançamento sem senha nenhuma, anulando a proteção de removeTabItem.
 */
export const undoLastTabItem = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess, revertStockMovement } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!teamPasswordMatches(data.password)) {
      return { ok: false as const, message: "Senha incorreta." };
    }

    const { data: session } = await admin()
      .from("fastbar_sessions")
      .select("id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) return { ok: false as const, message: "Comanda não encontrada." };
    if (session.status !== "open") {
      return { ok: false as const, message: "Comanda não está aberta." };
    }

    const { data: item } = await admin()
      .from("fastbar_tab_items")
      .select("id, product_id, quantity, session_id")
      .eq("session_id", session.id)
      .order("added_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!item) return { ok: false as const, message: "Não há lançamentos para desfazer." };

    // Mesmo padrão de removeTabItem: o delete condicional decide quem estorna, para que dois
    // "desfazer" simultâneos não devolvam o mesmo item ao estoque duas vezes.
    const { data: deleted, error } = await admin()
      .from("fastbar_tab_items")
      .delete()
      .eq("id", item.id)
      .select("id");
    if (error) return { ok: false as const, message: "Não foi possível desfazer o lançamento." };
    if (!deleted || deleted.length === 0) return { ok: true as const };

    const reverted = await revertStockMovement(item.product_id, item.session_id, item.quantity);
    if (!reverted.ok) {
      return { ok: false as const, message: "Lançamento desfeito, mas o estoque não voltou — confira o estoque." };
    }
    return { ok: true as const };
  });

/**
 * Remove todos os lançamentos da comanda, devolvendo tudo ao estoque. Só em comanda aberta.
 * Exige senha da equipe — mesmo padrão de remover item avulso.
 */
export const clearTabItems = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess, drainSessionItems } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!teamPasswordMatches(data.password)) {
      return { ok: false as const, message: "Senha incorreta." };
    }

    const { data: session, error: lookupError } = await admin()
      .from("fastbar_sessions")
      .select("id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (lookupError) {
      return { ok: false as const, message: "Não foi possível zerar a comanda." };
    }
    if (!session) return { ok: false as const, message: "Comanda não encontrada." };
    if (session.status !== "open") {
      return { ok: false as const, message: "Só dá pra zerar comanda aberta." };
    }

    // Mesmo drain do cancelamento: cada item é estornado por quem conseguiu apagá-lo, então zerar
    // duas vezes seguidas não credita nada em dobro.
    const drained = await drainSessionItems(session.id);
    if (!drained.ok) {
      return {
        ok: false as const,
        message: "Estoque não voltou por inteiro — tente zerar de novo.",
      };
    }
    return { ok: true as const, removed: drained.removed };
  });

/**
 * Cancela a comanda inteira: devolve ao estoque tudo que tinha sido lançado e marca como
 * cancelada. Uma comanda cancelada nunca vira "paid", então nunca entra no faturamento nem nos
 * relatórios — diferente de "fechar", que é passo normal a caminho do pagamento. Exige senha da
 * equipe (mesma do login do caixa).
 *
 * Repetir o cancelamento é seguro e às vezes necessário: se o estorno morrer no meio, a comanda
 * fica cancelada com lançamentos sobrando, e rodar de novo termina o serviço sem estornar duas
 * vezes o que já voltou.
 */
export const cancelSession = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess, drainSessionItems } = await import("./fastbar.server");
    const { teamPasswordMatches } = await import("./bar-gate.server");
    await assertRegisterAccess();
    if (!teamPasswordMatches(data.password)) {
      return { ok: false as const, message: "Senha incorreta." };
    }

    // Reserva a comanda antes de tocar em qualquer coisa: o UPDATE só pega a linha se ela ainda
    // estiver num estado cancelável, então um pagamento que tenha entrado no meio faz este
    // cancelamento perder a corrida — e perder sem ter destruído nada. Ler o status primeiro e
    // gravar no fim fazia o oposto: estornava estoque e apagava os itens de uma comanda que já
    // tinha sido paga, e só então sobrescrevia o pagamento.
    const { data: claimed, error: claimError } = await admin()
      .from("fastbar_sessions")
      .update({ status: "cancelled", closed_at: new Date().toISOString() })
      .eq("id", data.sessionId)
      .in("status", ["pending", "open", "closed"])
      .select("id");
    if (claimError) {
      return { ok: false as const, message: "Não foi possível cancelar a comanda." };
    }

    if (!claimed || claimed.length === 0) {
      const { data: current, error: lookupError } = await admin()
        .from("fastbar_sessions")
        .select("id, status")
        .eq("id", data.sessionId)
        .maybeSingle();
      // Sem distinguir a falha da consulta, um erro de banco seria reportado como "não encontrada"
      // e mandaria procurar uma comanda que existe.
      if (lookupError) {
        return { ok: false as const, message: "Não foi possível cancelar a comanda." };
      }
      if (!current) return { ok: false as const, message: "Comanda não encontrada." };
      // Já cancelada: não é erro, é um cancelamento anterior que não terminou de estornar.
      // Cai adiante para o drain, que é idempotente e só mexe no que ainda sobrou.
      if (current.status !== "cancelled") {
        return { ok: false as const, message: "Essa comanda não pode ser cancelada." };
      }
    }

    // A comanda já está cancelada e ninguém mais a move, então o estorno acontece sem disputa.
    const drained = await drainSessionItems(data.sessionId);
    if (!drained.ok) {
      return {
        ok: false as const,
        message: "Comanda cancelada, mas o estoque não voltou por inteiro — tente cancelar de novo.",
      };
    }
    return { ok: true as const };
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
