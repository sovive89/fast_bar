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

export type PublicBranding = { brandName: string; logoUrl: string | null };

/**
 * Lê a identidade visual pra renderizar em rotas do CLIENTE (sem gate de senha, ex.: /abrir e
 * /c/{sessionId}) — por isso não passa por assertRegisterAccess. Só devolve nome/logo, nunca as
 * outras integrações (tokens/ids ficam só no card de admin). Sem config salva, cai pro nome
 * genérico "FastBar" — a tela nunca fica sem marca nenhuma.
 */
export const getPublicBranding = createServerFn({ method: "GET" }).handler(async (): Promise<PublicBranding> => {
  const { admin } = await import("./fastbar.server");
  const { data } = await admin()
    .from("fastbar_integrations")
    .select("config")
    .eq("key", "branding")
    .maybeSingle();
  const config = (data?.config ?? {}) as IntegrationConfig;
  const brandName = config["brandName"]?.trim() || "FastBar";
  const logoUrl = config["logoUrl"]?.trim() || null;
  return { brandName, logoUrl };
});

/** Sobe o logo da marca pro Storage (bucket público fastbar-branding) e devolve a URL pública. */
export const uploadBrandLogo = createServerFn({ method: "POST" })
  .inputValidator((data: { fileName: string; base64: string; contentType: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();

    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${Date.now()}-${safeName}`;
    const bytes = Buffer.from(data.base64, "base64");

    const { error } = await admin()
      .storage.from("fastbar-branding")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (error) return { ok: false as const, message: "Não foi possível enviar o logo." };

    const { data: publicUrl } = admin().storage.from("fastbar-branding").getPublicUrl(path);
    return { ok: true as const, url: publicUrl.publicUrl };
  });
