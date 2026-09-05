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
 * Credenciais SÓ por variável de ambiente — nunca na tabela fastbar_integrations (banco), nunca no
 * frontend, nunca versionadas no Git. Diferente do resto do módulo Conexões (que guarda config no
 * banco por conector): aqui é exigência explícita da especificação de segurança para esta
 * integração específica, por lidar com autenticação de identidade.
 */
export class TwilioVerificationProvider implements VerificationProvider {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly verifyServiceSid: string;

  constructor() {
    const accountSid = process.env["TWILIO_ACCOUNT_SID"];
    const authToken = process.env["TWILIO_AUTH_TOKEN"];
    const verifyServiceSid = process.env["TWILIO_VERIFY_SERVICE_SID"];
    if (!accountSid || !authToken || !verifyServiceSid) {
      throw new Error(
        "Twilio Verify não configurado: defina TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e " +
          "TWILIO_VERIFY_SERVICE_SID nas variáveis de ambiente do deploy.",
      );
    }
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.verifyServiceSid = verifyServiceSid;
  }

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
