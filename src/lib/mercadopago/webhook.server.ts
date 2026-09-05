import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Confere a assinatura do webhook do Mercado Pago (header x-signature: "ts=...,v1=...") — sem
 * isso, qualquer um que descobrisse a URL do endpoint poderia forjar "pagamento aprovado" pra
 * qualquer comanda. O "manifest" (string assinada) segue o formato documentado pelo Mercado Pago:
 * "id:{data.id};request-id:{x-request-id};ts:{ts};", HMAC-SHA256 com o segredo do webhook
 * (diferente do Access Token — gerado em Suas integrações → Webhooks no painel do Mercado Pago).
 */
export function verifyWebhookSignature(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string;
  secret: string;
}): boolean {
  if (!params.secret || !params.xSignature) return false;

  const parts: Record<string, string> = {};
  for (const segment of params.xSignature.split(",")) {
    const [key, ...rest] = segment.split("=");
    if (!key) continue;
    parts[key.trim()] = rest.join("=").trim();
  }
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const manifest = `id:${params.dataId.toLowerCase()};request-id:${params.xRequestId ?? ""};ts:${ts};`;
  const expected = createHmac("sha256", params.secret).update(manifest).digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const gotBuf = Buffer.from(v1, "utf8");
  if (expectedBuf.length !== gotBuf.length) return false;
  return timingSafeEqual(expectedBuf, gotBuf);
}
