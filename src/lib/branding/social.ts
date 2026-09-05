/**
 * Normalização das redes da marca e da URL pública.
 *
 * Instagram e WhatsApp são digitados por gente, do jeito que a pessoa lembra: "@bar", a URL
 * inteira colada do navegador, "(61) 9 9999-9999". Guardar isso cru viraria link quebrado na tela
 * do cliente, então tudo passa por aqui antes de ser salvo — e de novo na leitura, porque config
 * salva antes dessas funções existirem continua no banco.
 */

/** "@bar", "instagram.com/bar/", "https://www.instagram.com/bar?igsh=x" → "bar". */
export function sanitizeInstagramUser(value: string | null | undefined): string | null {
  if (!value) return null;
  const withoutUrl = value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^instagram\.com\//i, "")
    .split(/[/?#]/)[0] ?? "";
  const handle = withoutUrl.replace(/^@+/, "").trim();
  // Regra do próprio Instagram: letras, números, ponto e underline, até 30 caracteres.
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return null;
  return handle.toLowerCase();
}

/** Só os dígitos do celular brasileiro (10 ou 11, com DDD). Aceita "+55" na frente e descarta. */
export function sanitizeWhatsappNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return null;
  return digits;
}

/** Link wa.me a partir do número já sanitizado (E.164 sem o "+", como o WhatsApp exige). */
export function whatsappLink(digits: string): string {
  return `https://wa.me/55${digits}`;
}

/** Link do perfil a partir do usuário já sanitizado. */
export function instagramLink(user: string): string {
  return `https://instagram.com/${user}`;
}

/**
 * URL pública fixa do app, usada pra gerar o QR code do balcão.
 *
 * Nunca window.location.origin: o gestor pode abrir o painel por uma URL de deploy específico da
 * Vercel (fast-bar-abc123.vercel.app), e o QR sairia impresso apontando pra um endereço que
 * expira — o QR colado no balcão quebraria sem ninguém perceber. Configurável por env pra quando
 * o domínio próprio entrar, com a URL estável de produção como padrão.
 */
export function publicBaseUrl(): string {
  const configured = import.meta.env["VITE_PUBLIC_BASE_URL"] as string | undefined;
  return (configured?.trim() || "https://fast-bar-two.vercel.app").replace(/\/+$/, "");
}
