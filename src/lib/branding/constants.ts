import type { TenantBranding } from "./types";

export const DEFAULT_BRAND_NAME = "Bar";

/** Branding padrão FastBar — usado enquanto a config carrega e quando o tenant não configurou
 * nada ainda. Nunca mostra o nome do software (Pop9Bar) pro cliente final, só um genérico neutro. */
export const DEFAULT_BRANDING: TenantBranding = {
  brandName: DEFAULT_BRAND_NAME,
  logoUrl: null,
  primaryColor: null,
  instagramUser: null,
  whatsappNumber: null,
};

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
