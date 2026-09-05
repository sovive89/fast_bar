import type { VerificationChannel, VerificationProvider } from "./types";

let _provider: VerificationProvider | undefined;

/** Ponto único de acesso ao provedor de verificação — client-session.functions.ts chama só as
 * funções abaixo, nunca o adapter diretamente. Import dinâmico (mesmo padrão usado no resto do
 * projeto pros módulos *.server.ts) evita puxar o adapter Twilio pro bundle do cliente. */
async function getProvider(): Promise<VerificationProvider> {
  if (!_provider) {
    const { TwilioVerificationProvider } = await import("./twilio-verify.server");
    _provider = new TwilioVerificationProvider();
  }
  return _provider;
}

/** Confere se as credenciais Twilio estão presentes via variável de ambiente, sem expor os
 * valores — usado só pra mostrar um indicador de status (configurado/não configurado) em
 * Conexões. */
export function isVerificationConfigured(): boolean {
  return Boolean(
    process.env["TWILIO_ACCOUNT_SID"] &&
      process.env["TWILIO_AUTH_TOKEN"] &&
      process.env["TWILIO_VERIFY_SERVICE_SID"],
  );
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
 */
export async function requestPhoneVerification(
  phone: string,
  channel: VerificationChannel = "whatsapp",
) {
  const provider = await getProvider();
  return provider.sendCode(toE164BR(phone), channel);
}

export async function checkPhoneVerification(phone: string, code: string) {
  const provider = await getProvider();
  return provider.checkCode(toE164BR(phone), code);
}
