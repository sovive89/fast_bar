import { createServerFn } from "@tanstack/react-start";
import { DEFAULT_BRAND_NAME, HEX_COLOR_PATTERN } from "./constants";
import type { TenantBranding } from "./types";

/**
 * Lê a identidade visual pra renderizar em rotas do CLIENTE (sem gate de senha, ex.: /abrir e
 * /c/{sessionId}) — por isso não passa por assertRegisterAccess. Só devolve nome/logo/cor, nunca
 * as outras integrações (tokens/ids ficam só no card de admin em Conexões). Sem config salva, cai
 * pro nome genérico "Bar" e sem cor customizada — a tela nunca fica sem marca nenhuma, mas também
 * nunca mostra o nome do software (Pop9Bar) pro cliente final, só a identidade do estabelecimento.
 */
export const getPublicBranding = createServerFn({ method: "GET" }).handler(
  async (): Promise<TenantBranding> => {
    const { admin } = await import("../fastbar.server");
    const { data } = await admin()
      .from("fastbar_integrations")
      .select("config")
      .eq("key", "branding")
      .maybeSingle();
    const config = (data?.config ?? {}) as Record<string, string>;
    const brandName = config["brandName"]?.trim() || DEFAULT_BRAND_NAME;
    const logoUrl = config["logoUrl"]?.trim() || null;
    const primaryColor = HEX_COLOR_PATTERN.test(config["primaryColor"] ?? "")
      ? config["primaryColor"]!
      : null;
    return { brandName, logoUrl, primaryColor };
  },
);

/** Sobe o logo da marca pro Storage (bucket público fastbar-branding) e devolve a URL pública. */
export const uploadBrandLogo = createServerFn({ method: "POST" })
  .inputValidator((data: { fileName: string; base64: string; contentType: string }) => data)
  .handler(async ({ data }) => {
    const { admin, assertRegisterAccess } = await import("../fastbar.server");
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
