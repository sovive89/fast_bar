import { createServerFn } from "@tanstack/react-start";

export type IntegrationKey = "whatsapp" | "instagram" | "mercado_pago" | "twilio" | "printer" | "branding";

// Toda config salva é string→string (campos de formulário: tokens, ids, urls) — mantém o tipo
// simples o bastante pra passar pela validação de serialização do createServerFn.
export type IntegrationConfig = Record<string, string>;

export type IntegrationRow = {
  key: IntegrationKey;
  enabled: boolean;
  config: IntegrationConfig;
  updated_at: string;
};

/**
 * Lista as integrações e seu estado atual (habilitada + config salva). O módulo Conexões é só um
 * hub de configuração/status por enquanto — nenhuma dessas integrações dispara chamadas reais
 * ainda (WhatsApp/Instagram/Twilio enviando mensagem, Mercado Pago cobrando na maquininha); cada
 * card mostra "em breve" pro que ainda não está ligado de fato, seguindo o mesmo padrão já usado
 * em Estoque pra "Foto da nota".
 */
export const getIntegrations = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { data } = await admin()
    .from("fastbar_integrations")
    .select("key, enabled, config, updated_at")
    .order("key");
  return { integrations: (data ?? []) as IntegrationRow[] };
});

export const updateIntegration = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { key: IntegrationKey; enabled?: boolean | undefined; config?: IntegrationConfig | undefined }) => data,
  )
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const patch: { updated_at: string; enabled?: boolean; config?: IntegrationConfig } = {
      updated_at: new Date().toISOString(),
    };
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.config !== undefined) patch.config = data.config;

    const { error } = await admin().from("fastbar_integrations").update(patch).eq("key", data.key);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

// getPublicBranding e uploadBrandLogo (identidade visual: nome, logo, cor) saíram daqui — agora
// moram em "@/lib/branding", módulo próprio que não mistura com o resto das integrações
// (WhatsApp/Instagram/Mercado Pago/etc.) guardadas nesta tabela.

/**
 * Status da verificação de celular por WhatsApp/SMS (Twilio Verify) — só diz se a config salva em
 * Conexões (key "twilio") está completa e habilitada, nunca os valores. Usado pro selo
 * "Configurado"/"Não configurado" no card — o card em si já mostra e edita os campos.
 */
export const getVerificationStatus = createServerFn({ method: "POST" }).handler(async () => {
  const { assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { isVerificationConfigured } = await import("./verification/service.server");
  return { configured: await isVerificationConfigured() };
});

/** Diz se a maquininha (Mercado Pago Point) está pronta pra cobrar — habilitada, com token e
 * terminal escolhido. Usado pra mostrar ou esconder a opção "Cobrar na maquininha" na tela da
 * comanda, sem expor nada da config em si. */
export const getMachinePaymentStatus = createServerFn({ method: "POST" }).handler(async () => {
  const { assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { isPointConfigured } = await import("./mercadopago/service.server");
  return { configured: await isPointConfigured() };
});

/**
 * Busca os terminais Point pareados com a conta do Access Token informado — usado pelo card de
 * Mercado Pago em Conexões pra equipe escolher o terminal certo em vez de digitar o ID na mão.
 * Recebe o token direto (não o salvo no banco) pra funcionar mesmo antes de "Salvar", enquanto a
 * equipe ainda está testando qual token cola.
 */
export const listMercadoPagoTerminals = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    if (!data.accessToken.trim()) {
      return { ok: false as const, message: "Informe o Access Token primeiro." };
    }
    const { listTerminalsForToken } = await import("./mercadopago/service.server");
    const result = await listTerminalsForToken(data.accessToken.trim());
    if (!result.ok) return { ok: false as const, message: result.message };
    return { ok: true as const, terminals: result.terminals };
  });
