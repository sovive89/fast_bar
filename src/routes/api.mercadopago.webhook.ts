import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint que o Mercado Pago chama quando o status de um pedido (cobrança na maquininha) muda —
 * é assim que a comanda fecha sozinha quando o cliente paga no terminal, sem a equipe precisar
 * ficar checando. URL pra colar em Suas integrações → Webhooks no painel do Mercado Pago:
 * https://<seu-domínio>/api/mercadopago/webhook.
 *
 * Sempre responde 200 (o Mercado Pago reenvia se não receber 200/201 em ~22s) mesmo quando ignora
 * a notificação — assinatura inválida ou corpo sem o que precisa não é erro nosso, é só "nada a
 * fazer com isso", e devolver erro faria o Mercado Pago insistir sem necessidade.
 */
export const Route = createFileRoute("/api/mercadopago/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown = null;
        try {
          payload = await request.json();
        } catch {
          return new Response("ok", { status: 200 });
        }

        const dataId =
          payload && typeof payload === "object" && "data" in payload
            ? String((payload as { data?: { id?: unknown } }).data?.id ?? "")
            : "";
        if (!dataId) return new Response("ok", { status: 200 });

        const { getWebhookSecret, reconcilePointOrder } = await import(
          "@/lib/mercadopago/service.server"
        );
        const { verifyWebhookSignature } = await import("@/lib/mercadopago/webhook.server");

        const secret = await getWebhookSecret();
        const valid = verifyWebhookSignature({
          xSignature: request.headers.get("x-signature"),
          xRequestId: request.headers.get("x-request-id"),
          dataId,
          secret,
        });
        if (!valid) {
          console.warn("Webhook Mercado Pago: assinatura ausente ou inválida, ignorado.");
          return new Response("ok", { status: 200 });
        }

        await reconcilePointOrder(dataId);
        return new Response("ok", { status: 200 });
      },
    },
  },
});
