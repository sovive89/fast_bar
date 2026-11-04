import { createECDH, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import webpush from "web-push";

/**
 * A biblioteca web-push DE VERDADE, sem rede: monta o pedido criptografado que iria para o serviço de
 * push (Google/Apple/Mozilla). Prova que as chaves VAPID, o formato da inscrição e as opções que o
 * app usa (validade curta, urgência alta) produzem um pedido válido. Não prova a entrega num
 * aparelho — isso só o teste no celular de verdade mostra.
 */
describe("web-push (biblioteca real, sem rede)", () => {
  it("monta um pedido válido com as opções do app", () => {
    const vapid = webpush.generateVAPIDKeys();
    webpush.setVapidDetails("mailto:bar@example.com", vapid.publicKey, vapid.privateKey);

    // Inscrição como o navegador gera: chave pública P-256 do aparelho + segredo de autenticação.
    const device = createECDH("prime256v1");
    device.generateKeys();
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: {
        p256dh: device.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
    };

    const payload = JSON.stringify({
      kind: "conta",
      title: "Pedido de conta",
      body: "Ana pediu a conta",
    });
    const request = webpush.generateRequestDetails(subscription, payload, {
      TTL: 120,
      urgency: "high",
    });

    expect(request.method).toBe("POST");
    expect(request.endpoint).toBe(subscription.endpoint);
    const headers = request.headers as Record<string, string>;
    expect(Number(headers["TTL"])).toBe(120);
    expect(headers["Urgency"]).toBe("high");
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers["Authorization"]).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    // O corpo vai criptografado: o texto da notificação não pode aparecer em claro.
    expect(Buffer.isBuffer(request.body)).toBe(true);
    expect((request.body as Buffer).toString("utf8")).not.toContain("Ana pediu a conta");
  });

  it("recusa uma chave pública VAPID malformada (por isso conferimos a configuração)", () => {
    expect(() => webpush.setVapidDetails("mailto:bar@example.com", "curta", "x")).toThrow();
  });
});
