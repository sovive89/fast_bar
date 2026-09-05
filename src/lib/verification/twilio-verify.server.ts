import type {
  CheckCodeResult,
  SendCodeResult,
  VerificationChannel,
  VerificationProvider,
} from "./types";

/**
 * Adapter pro Twilio Verify — serviço gerenciado de OTP (o Twilio guarda, expira e limita
 * tentativas do código; este app nunca vê nem armazena o código em si). É o único arquivo do
 * projeto que sabe que existe Twilio.
 *
 * Credenciais chegam por parâmetro (config do tenant, lida em service.server.ts), não por
 * variável de ambiente. Isso mudou de propósito: a versão anterior lia direto de
 * process.env porque na época só existia um deploy. Numa versão multi-tenant, cada bar tem sua
 * própria conta Twilio (número, custo e limites são dele) — variável de ambiente do Vercel é uma
 * config só, compartilhada por todo mundo que sobe nesse deploy, o que não serve pra isso.
 */
export class TwilioVerificationProvider implements VerificationProvider {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly verifyServiceSid: string,
  ) {}

  private authHeader() {
    const encoded = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    return `Basic ${encoded}`;
  }

  async sendCode(phoneE164: string, channel: VerificationChannel): Promise<SendCodeResult> {
    try {
      const res = await fetch(
        `https://verify.twilio.com/v2/Services/${this.verifyServiceSid}/Verifications`,
        {
          method: "POST",
          headers: {
            Authorization: this.authHeader(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: phoneE164, Channel: channel }),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("Twilio Verify: falha ao enviar código", res.status, body);
        return { ok: false, message: "Não foi possível enviar o código. Tente novamente." };
      }
      return { ok: true };
    } catch (err) {
      console.error("Twilio Verify: erro de rede ao enviar código", err);
      return { ok: false, message: "Não foi possível enviar o código. Tente novamente." };
    }
  }

  async checkCode(phoneE164: string, code: string): Promise<CheckCodeResult> {
    try {
      const res = await fetch(
        `https://verify.twilio.com/v2/Services/${this.verifyServiceSid}/VerificationCheck`,
        {
          method: "POST",
          headers: {
            Authorization: this.authHeader(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: phoneE164, Code: code }),
        },
      );
      if (res.status === 404) {
        // Nenhuma verificação pendente pra esse número (expirou ou nunca existiu no Twilio) —
        // trata como código errado pro cliente, não como erro de sistema.
        return { ok: true, verified: false };
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("Twilio Verify: falha ao checar código", res.status, body);
        return { ok: false, message: "Não foi possível confirmar o código. Tente novamente." };
      }
      const json = (await res.json()) as { status?: string };
      return { ok: true, verified: json.status === "approved" };
    } catch (err) {
      console.error("Twilio Verify: erro de rede ao checar código", err);
      return { ok: false, message: "Não foi possível confirmar o código. Tente novamente." };
    }
  }
}
