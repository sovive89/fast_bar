import type { VerificationChannel } from "./types";

/**
 * Credenciais Twilio salvas pelo tenant em Conexões (fastbar_integrations, key = "twilio") — mesma
 * tabela/padrão usado por branding e roleta. Diferente daquelas, aqui NÃO existe um "padrão" de
 * código pra cair quando o tenant não configurou nada: não faz sentido a aplicação ter uma conta
 * Twilio compartilhada por todo mundo (custo e limite de envio são do bar). Sem config salva e
 * habilitada, a verificação simplesmente fica desligada pra aquele tenant — client-session.functions
 * já trata isso pulando a etapa de OTP.
 */
interface TwilioTenantConfig {
  accountSid: string;
  authToken: string;
  verifyServiceSid: string;
}

async function loadTwilioConfig(): Promise<TwilioTenantConfig | null> {
  const { admin } = await import("../fastbar.server");
  const { data } = await admin()
    .from("fastbar_integrations")
    .select("enabled, config")
    .eq("key", "twilio")
    .maybeSingle();

  if (!data?.enabled) return null;

  const config = (data.config ?? {}) as Record<string, unknown>;
  const accountSid = typeof config["accountSid"] === "string" ? config["accountSid"].trim() : "";
  const authToken = typeof config["authToken"] === "string" ? config["authToken"].trim() : "";
  const verifyServiceSid =
    typeof config["verifyServiceSid"] === "string" ? config["verifyServiceSid"].trim() : "";

  if (!accountSid || !authToken || !verifyServiceSid) return null;
  return { accountSid, authToken, verifyServiceSid };
}

/** Confere se a verificação está pronta pra uso (config salva, habilitada e completa) — sem expor
 * os valores. Usado pro indicador de status em Conexões e pra decidir se a etapa de OTP entra no
 * fluxo de abertura de comanda. */
export async function isVerificationConfigured(): Promise<boolean> {
  return (await loadTwilioConfig()) !== null;
}

/** Celular brasileiro (10 ou 11 dígitos, já sanitizado por sanitizePhone) no formato E.164 que o
 * Twilio exige. */
export function toE164BR(phone: string): string {
  return `+55${phone}`;
}

/**
 * Canal escolhido pelo cliente na tela de abertura. WhatsApp é o padrão (chega na hora e não custa
 * SMS), mas quem não usa WhatsApp — ou está sem internet no celular — precisa do SMS pra conseguir
 * abrir a comanda, então a escolha é dele, não nossa.
 *
 * Busca a config do tenant a cada chamada (sem cache) — assim, se a equipe troca ou corrige as
 * credenciais em Conexões, a próxima verificação já usa o valor novo, sem precisar redeploy.
 */
export async function requestPhoneVerification(
  phone: string,
  channel: VerificationChannel = "whatsapp",
) {
  const config = await loadTwilioConfig();
  if (!config) {
    return { ok: false as const, message: "Verificação por celular não está configurada." };
  }
  const { TwilioVerificationProvider } = await import("./twilio-verify.server");
  const provider = new TwilioVerificationProvider(
    config.accountSid,
    config.authToken,
    config.verifyServiceSid,
  );
  return provider.sendCode(toE164BR(phone), channel);
}

export async function checkPhoneVerification(phone: string, code: string) {
  const config = await loadTwilioConfig();
  if (!config) {
    return { ok: false as const, message: "Verificação por celular não está configurada." };
  }
  const { TwilioVerificationProvider } = await import("./twilio-verify.server");
  const provider = new TwilioVerificationProvider(
    config.accountSid,
    config.authToken,
    config.verifyServiceSid,
  );
  return provider.checkCode(toE164BR(phone), code);
}
