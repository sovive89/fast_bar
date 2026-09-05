import { randomUUID } from "node:crypto";
import { cancelPointOrder, createPointOrder, getPointOrder, listPointTerminals } from "./client.server";

/** Config salva em fastbar_integrations (key='mercado_pago') — mesmo padrão DB-config do resto de
 * Conexões (diferente do Twilio, que ficou só em env var por exigência específica daquela
 * integração). */
async function getConfig() {
  const { admin } = await import("../fastbar.server");
  const { data } = await admin()
    .from("fastbar_integrations")
    .select("enabled, config")
    .eq("key", "mercado_pago")
    .maybeSingle();
  const config = (data?.config ?? {}) as Record<string, string>;
  return {
    enabled: data?.enabled ?? false,
    accessToken: config["accessToken"] ?? "",
    terminalId: config["deviceId"] ?? "",
    webhookSecret: config["webhookSecret"] ?? "",
  };
}

/** Usado pra mostrar/esconder a opção "Cobrar na maquininha" na tela da comanda — só aparece
 * configurada, habilitada e com terminal escolhido. */
export async function isPointConfigured(): Promise<boolean> {
  const cfg = await getConfig();
  return cfg.enabled && Boolean(cfg.accessToken) && Boolean(cfg.terminalId);
}

export async function getWebhookSecret(): Promise<string> {
  return (await getConfig()).webhookSecret;
}

export async function listTerminalsForToken(accessToken: string) {
  return listPointTerminals(accessToken);
}

// A API devolve o tipo técnico do meio de pagamento (credit_card/debit_card/pix/account_money) —
// mapeado pro mesmo vocabulário (dinheiro/cartao/pix/...) usado no pagamento manual, com
// "credito"/"debito" novos só pra cobrança por maquininha, onde dá pra saber a diferença de
// verdade (o pagamento manual nunca soube distinguir cartão de crédito de débito).
const CHANNEL_BY_TYPE: Record<string, string> = {
  credit_card: "credito",
  debit_card: "debito",
  pix: "pix",
  account_money: "pix",
};

function mapChannel(type: string | undefined): string {
  return (type && CHANNEL_BY_TYPE[type]) || "cartao";
}

/** Envia a cobrança pro terminal — cria o pedido no Mercado Pago e grava o ID na comanda pra
 * correlacionar quando o webhook (ou a checagem manual) confirmar o pagamento. */
export async function startPointCharge(sessionId: string, amount: number) {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.accessToken || !cfg.terminalId) {
    return { ok: false as const, message: "Maquininha não configurada em Conexões." };
  }

  const { admin } = await import("../fastbar.server");
  // Já existe cobrança em andamento pra essa comanda: não manda outra pro terminal por cima.
  const { data: current } = await admin()
    .from("fastbar_sessions")
    .select("pos_order_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (current?.pos_order_id) {
    return { ok: false as const, message: "Já existe uma cobrança em andamento nessa comanda." };
  }

  const result = await createPointOrder({
    accessToken: cfg.accessToken,
    terminalId: cfg.terminalId,
    amount,
    externalReference: sessionId,
    idempotencyKey: randomUUID(),
  });
  if (!result.ok) return { ok: false as const, message: result.message };

  const { error } = await admin()
    .from("fastbar_sessions")
    .update({
      pos_order_id: result.order.id,
      pos_requested_at: new Date().toISOString(),
      pos_amount: amount,
    })
    .eq("id", sessionId);
  if (error) return { ok: false as const, message: "Cobrança enviada, mas não foi possível salvar na comanda." };

  return { ok: true as const, orderId: result.order.id };
}

/** Cancela a cobrança em andamento — usado quando o terminal não responde, o valor estava errado,
 * ou a equipe quer voltar pro pagamento manual. */
export async function cancelPointCharge(sessionId: string) {
  const { admin } = await import("../fastbar.server");
  const { data: session } = await admin()
    .from("fastbar_sessions")
    .select("pos_order_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session?.pos_order_id) return { ok: true as const };

  const cfg = await getConfig();
  if (cfg.accessToken) await cancelPointOrder(cfg.accessToken, session.pos_order_id);

  await admin()
    .from("fastbar_sessions")
    .update({ pos_order_id: null, pos_requested_at: null, pos_amount: null })
    .eq("id", sessionId);
  return { ok: true as const };
}

/**
 * Busca o pedido no Mercado Pago e, se terminou, credita o pagamento na comanda (mesmo efeito de
 * registerPayment, só que com o canal de verdade em vez de escolhido manualmente). Chamada tanto
 * pelo webhook quanto por um botão "Verificar agora" na tela da comanda — rede pode falhar e
 * webhook pode atrasar ou não chegar, então a equipe nunca fica travada esperando.
 *
 * Idempotente: se a comanda já não está mais aguardando essa cobrança (pos_order_id mudou, ou já
 * foi paga/cancelada), não faz nada — protege contra webhook duplicado ou atrasado chegando depois
 * que a equipe já resolveu de outro jeito.
 */
export async function reconcilePointOrder(orderId: string) {
  const cfg = await getConfig();
  if (!cfg.accessToken) return;

  const order = await getPointOrder(cfg.accessToken, orderId);
  if (!order?.external_reference) return;
  const sessionId = order.external_reference;

  const { admin, registerCustomerSpend } = await import("../fastbar.server");
  const { data: session } = await admin()
    .from("fastbar_sessions")
    .select("id, status, pos_order_id, closed_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.pos_order_id !== orderId) return;
  if (session.status === "paid" || session.status === "cancelled") return;

  if (order.status === "finished") {
    const payment = order.transactions?.payments?.[0];
    const method = mapChannel(payment?.payment_method?.type);
    const nowIso = new Date().toISOString();
    const { error } = await admin()
      .from("fastbar_sessions")
      .update({
        status: "paid",
        closed_at: session.closed_at ?? nowIso,
        paid_at: nowIso,
        payment_method: method,
        pos_order_id: null,
        pos_requested_at: null,
      })
      .eq("id", sessionId)
      .neq("status", "cancelled");
    if (!error) await registerCustomerSpend(sessionId);
    return;
  }

  if (order.status === "error" || order.status === "canceled") {
    // Pagamento não foi pra frente no terminal (recusado, cancelado, etc.) — libera a comanda pra
    // tentar de novo (maquininha ou manual), sem mexer no status dela.
    await admin()
      .from("fastbar_sessions")
      .update({ pos_order_id: null, pos_requested_at: null, pos_amount: null })
      .eq("id", sessionId)
      .eq("pos_order_id", orderId);
  }
  // created/processing/at_terminal: cobrança ainda em andamento, nada a fazer ainda.
}
