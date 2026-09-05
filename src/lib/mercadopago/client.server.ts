import { randomUUID } from "node:crypto";
import type { PointOrder, PointTerminal } from "./types";

/**
 * Chamadas cruas à API do Mercado Pago (Orders/Point) — nenhum outro arquivo do projeto fala HTTP
 * com o Mercado Pago diretamente. service.server.ts é quem decide o que fazer com essas respostas
 * (achar a comanda pelo external_reference, creditar pagamento, etc.).
 */
const MP_API = "https://api.mercadopago.com";

async function mpFetch(accessToken: string, path: string, init?: RequestInit) {
  return fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function listPointTerminals(
  accessToken: string,
): Promise<{ ok: true; terminals: PointTerminal[] } | { ok: false; message: string }> {
  try {
    const res = await mpFetch(accessToken, "/terminals/v1/list?limit=50");
    if (!res.ok) {
      return { ok: false, message: `Mercado Pago recusou a busca de terminais (HTTP ${res.status}).` };
    }
    const json = (await res.json()) as { data?: { terminals?: PointTerminal[] } };
    return { ok: true, terminals: json.data?.terminals ?? [] };
  } catch (err) {
    console.error("Mercado Pago: erro de rede ao listar terminais", err);
    return { ok: false, message: "Não foi possível buscar os terminais. Tente novamente." };
  }
}

export async function createPointOrder(params: {
  accessToken: string;
  terminalId: string;
  amount: number;
  externalReference: string;
  idempotencyKey: string;
}): Promise<{ ok: true; order: PointOrder } | { ok: false; message: string }> {
  try {
    const res = await mpFetch(params.accessToken, "/v1/orders", {
      method: "POST",
      headers: { "X-Idempotency-Key": params.idempotencyKey },
      body: JSON.stringify({
        type: "point",
        external_reference: params.externalReference,
        transactions: { payments: [{ amount: params.amount.toFixed(2) }] },
        config: { point: { terminal_id: params.terminalId, print_on_terminal: "no_ticket" } },
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      // Loga o corpo inteiro do erro — a mensagem que vira texto pra equipe é só um resumo, mas
      // aqui fica o "cause" detalhado que o Mercado Pago manda (ex.: terminal offline, formato de
      // terminal_id errado), essencial pra diagnosticar sem precisar adivinhar.
      console.error("Mercado Pago recusou a criação do pedido:", res.status, JSON.stringify(json));
      const causeDescription =
        Array.isArray(json?.cause) && typeof json.cause[0]?.description === "string"
          ? json.cause[0].description
          : null;
      const message =
        causeDescription ??
        (typeof json?.message === "string" ? json.message : `Mercado Pago recusou a cobrança (HTTP ${res.status}).`);
      return { ok: false, message };
    }
    return { ok: true, order: json as PointOrder };
  } catch (err) {
    console.error("Mercado Pago: erro de rede ao criar cobrança", err);
    return { ok: false, message: "Não foi possível enviar a cobrança pra maquininha. Tente novamente." };
  }
}

export async function getPointOrder(accessToken: string, orderId: string): Promise<PointOrder | null> {
  try {
    const res = await mpFetch(accessToken, `/v1/orders/${orderId}`);
    if (!res.ok) return null;
    return (await res.json()) as PointOrder;
  } catch (err) {
    console.error("Mercado Pago: erro de rede ao consultar pedido", err);
    return null;
  }
}

export async function cancelPointOrder(accessToken: string, orderId: string): Promise<boolean> {
  try {
    // X-Idempotency-Key é obrigatório aqui — sem ele o Mercado Pago recusa com HTTP 400
    // (empty_required_header) e o pedido continua vivo do lado deles (podendo travar o
    // terminal pra próxima cobrança, com o mesmo 409 de "já na fila" que já vimos antes).
    const res = await mpFetch(accessToken, `/v1/orders/${orderId}/cancel`, {
      method: "POST",
      headers: { "X-Idempotency-Key": randomUUID() },
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      console.error("Mercado Pago recusou o cancelamento do pedido:", res.status, JSON.stringify(json));
    }
    return res.ok;
  } catch (err) {
    console.error("Mercado Pago: erro de rede ao cancelar pedido", err);
    return false;
  }
}
