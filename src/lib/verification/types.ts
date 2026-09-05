/**
 * Contrato de verificação de celular — regra arquitetural: nenhum outro arquivo do app fala com o
 * Twilio (ou qualquer provedor) diretamente. Tudo passa por este tipo + service.server.ts, então
 * trocar de provedor no futuro é escrever um novo adapter, sem tocar em rotas nem em
 * client-session.functions.ts.
 */
export type VerificationChannel = "whatsapp" | "sms";

export type SendCodeResult = { ok: true } | { ok: false; message: string };

export type CheckCodeResult =
  | { ok: true; verified: boolean }
  | { ok: false; message: string };

export interface VerificationProvider {
  sendCode(phoneE164: string, channel: VerificationChannel): Promise<SendCodeResult>;
  checkCode(phoneE164: string, code: string): Promise<CheckCodeResult>;
}
