/**
 * Identidade visual do estabelecimento (tenant). Cada bar hoje é um deployment próprio (um projeto
 * Supabase, uma instância) — não multi-tenant em linha de banco — então o fallback é só um nível:
 * Tenant → Padrão FastBar. Sem "unidade" ainda; entra se o produto crescer pra múltiplas lojas por
 * conta.
 *
 * Campos aqui são o subconjunto essencial que a experiência do cliente já usa. O resto da ideia de
 * design tokens (radius, fontFamily, cores de sistema como success/warning) fica pra quando alguma
 * tela realmente precisar — não vale antecipar campo que nada lê.
 */
export interface TenantBranding {
  brandName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  /** Usuário do Instagram já normalizado — só o handle, sem "@" nem URL. */
  instagramUser: string | null;
  /** WhatsApp só em dígitos (DDD + número), sem o 55 do país. */
  whatsappNumber: string | null;
}
