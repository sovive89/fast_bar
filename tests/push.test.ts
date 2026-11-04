import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

const holder: { db: FakeSupabase } = { db: new FakeSupabase() };
vi.mock("../src/lib/fastbar.server", () => ({ admin: () => holder.db }));

const webpush = {
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(async () => ({ statusCode: 201 })),
};
vi.mock("web-push", () => ({ default: webpush }));

const { readPushConfig, validateSubscription, saveSubscription, removeSubscription, notifyStaff } =
  await import("../src/lib/push.server");

const payload = {
  kind: "conta" as const,
  title: "Pedido de conta",
  body: "Ana pediu a conta",
  url: "/caixa/s1",
  tag: "conta-s1",
};

const subscription = (n: number) => ({
  endpoint: `https://push.example.com/send/${n}`,
  keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` },
});

const ENV = {
  VAPID_PUBLIC_KEY: "pub",
  VAPID_PRIVATE_KEY: "priv",
  VAPID_SUBJECT: "mailto:bar@example.com",
};

beforeEach(() => {
  holder.db = new FakeSupabase();
  webpush.setVapidDetails.mockClear();
  webpush.sendNotification.mockReset();
  webpush.sendNotification.mockResolvedValue({ statusCode: 201 });
  Object.assign(process.env, ENV);
});

const rows = () => holder.db.table("fastbar_push_subscriptions");

describe("configuração", () => {
  it("só liga com as três variáveis", () => {
    expect(readPushConfig(ENV)).toEqual({
      publicKey: "pub",
      privateKey: "priv",
      subject: "mailto:bar@example.com",
    });
    for (const missing of Object.keys(ENV)) {
      const partial = { ...ENV, [missing]: undefined };
      expect(readPushConfig(partial)).toBeNull();
    }
    expect(readPushConfig({ ...ENV, VAPID_SUBJECT: "   " })).toBeNull();
  });
});

describe("validação da inscrição", () => {
  it("aceita uma inscrição completa com endereço https", () => {
    expect(validateSubscription(subscription(1)).ok).toBe(true);
  });

  it("recusa o que está faltando, quebrado, grande demais ou não-https", () => {
    const bad: unknown[] = [
      null,
      {},
      { endpoint: "https://x.com/a" },
      { endpoint: "https://x.com/a", keys: { p256dh: "a" } },
      { endpoint: "", keys: { p256dh: "a", auth: "b" } },
      { endpoint: "não é url", keys: { p256dh: "a", auth: "b" } },
      // Impede usar a inscrição para o servidor chamar endereço interno/inseguro.
      { endpoint: "http://push.example.com/a", keys: { p256dh: "a", auth: "b" } },
      { endpoint: "http://169.254.169.254/latest", keys: { p256dh: "a", auth: "b" } },
      { endpoint: `https://x.com/${"a".repeat(2100)}`, keys: { p256dh: "a", auth: "b" } },
    ];
    for (const input of bad) expect(validateSubscription(input).ok).toBe(false);
  });
});

describe("guardar inscrições", () => {
  it("grava, e ativar de novo o mesmo aparelho atualiza em vez de duplicar", async () => {
    expect((await saveSubscription(subscription(1), "iPhone")).ok).toBe(true);
    expect(rows()).toHaveLength(1);
    const again = { ...subscription(1), keys: { p256dh: "novo", auth: "novo" } };
    expect((await saveSubscription(again, "iPhone")).ok).toBe(true);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ p256dh: "novo", auth: "novo" });
  });

  it("não grava inscrição inválida", async () => {
    const result = await saveSubscription({ endpoint: "http://x.com", keys: {} }, null);
    expect(result.ok).toBe(false);
    expect(rows()).toHaveLength(0);
  });

  it("remover apaga só aquele aparelho", async () => {
    await saveSubscription(subscription(1), null);
    await saveSubscription(subscription(2), null);
    await removeSubscription(subscription(1).endpoint);
    expect(rows().map((r) => r.endpoint)).toEqual([subscription(2).endpoint]);
  });
});

describe("avisar a equipe", () => {
  it("sem chaves configuradas não faz nada e não falha", async () => {
    delete process.env["VAPID_PRIVATE_KEY"];
    await saveSubscription(subscription(1), null);
    const result = await notifyStaff(payload);
    expect(result).toEqual({ sent: 0, removed: 0, failed: 0, skipped: "not_configured" });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("sem aparelhos inscritos não faz nada", async () => {
    expect(await notifyStaff(payload)).toMatchObject({ sent: 0, skipped: "no_subscribers" });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("manda para todos os aparelhos, com o texto, urgência alta e validade curta", async () => {
    await saveSubscription(subscription(1), null);
    await saveSubscription(subscription(2), null);
    const result = await notifyStaff(payload);
    expect(result).toEqual({ sent: 2, removed: 0, failed: 0 });
    expect(webpush.setVapidDetails).toHaveBeenCalledWith("mailto:bar@example.com", "pub", "priv");
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    const [target, body, options] = webpush.sendNotification.mock.calls[0] as unknown as [
      { endpoint: string; keys: { p256dh: string; auth: string } },
      string,
      { TTL: number; urgency: string },
    ];
    expect(target.endpoint).toBe(subscription(1).endpoint);
    expect(JSON.parse(body)).toEqual(payload);
    expect(options).toMatchObject({ TTL: 120, urgency: "high" });
  });

  it("apaga o aparelho que o serviço de push diz que não existe mais (404/410)", async () => {
    await saveSubscription(subscription(1), null);
    await saveSubscription(subscription(2), null);
    await saveSubscription(subscription(3), null);
    webpush.sendNotification.mockImplementation(async (target: { endpoint: string }) => {
      if (target.endpoint.endsWith("/1"))
        throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (target.endpoint.endsWith("/2")) throw Object.assign(new Error("nf"), { statusCode: 404 });
      return { statusCode: 201 };
    });
    const result = await notifyStaff(payload);
    expect(result).toEqual({ sent: 1, removed: 2, failed: 0 });
    expect(rows().map((r) => r.endpoint)).toEqual([subscription(3).endpoint]);
  });

  it("erro passageiro (5xx, rede) NÃO apaga o aparelho; só conta como falha", async () => {
    await saveSubscription(subscription(1), null);
    webpush.sendNotification.mockRejectedValue(
      Object.assign(new Error("boom"), { statusCode: 503 }),
    );
    const result = await notifyStaff(payload);
    expect(result).toEqual({ sent: 0, removed: 0, failed: 1 });
    expect(rows()).toHaveLength(1);
  });

  it("um aparelho com defeito não impede os outros de receber", async () => {
    await saveSubscription(subscription(1), null);
    await saveSubscription(subscription(2), null);
    webpush.sendNotification.mockImplementation(async (target: { endpoint: string }) => {
      if (target.endpoint.endsWith("/1")) throw new Error("rede caiu");
      return { statusCode: 201 };
    });
    expect(await notifyStaff(payload)).toEqual({ sent: 1, removed: 0, failed: 1 });
  });

  it("nunca lança, nem se a biblioteca quebrar ao configurar", async () => {
    await saveSubscription(subscription(1), null);
    webpush.setVapidDetails.mockImplementationOnce(() => {
      throw new Error("chave inválida");
    });
    await expect(notifyStaff(payload)).resolves.toMatchObject({ sent: 0, failed: 1 });
  });
});
