import { createServerFn } from "@tanstack/react-start";

/**
 * Camada createServerFn do push — só expõe os server functions; a lógica mora em push.server.ts.
 * Tudo exige a senha do caixa: só a equipe inscreve aparelhos e dispara teste.
 */

/** O push está configurado no servidor? Devolve a chave PÚBLICA (a que o navegador precisa para se
 * inscrever); a privada nunca sai do servidor. */
export const getPushStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { readPushConfig } = await import("./push.server");
  const config = readPushConfig();
  return { configured: Boolean(config), publicKey: config?.publicKey ?? null };
});

export const subscribePush = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
      userAgent?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { saveSubscription } = await import("./push.server");
    return saveSubscription(data.subscription, data.userAgent?.slice(0, 300) ?? null);
  });

export const unsubscribePush = createServerFn({ method: "POST" })
  .inputValidator((data: { endpoint: string }) => data)
  .handler(async ({ data }) => {
    const { assertRegisterAccess } = await import("./fastbar.server");
    await assertRegisterAccess();
    const { removeSubscription } = await import("./push.server");
    await removeSubscription(data.endpoint);
    return { ok: true as const };
  });

/** Manda uma notificação de teste para todos os aparelhos inscritos — a equipe confere na hora se o
 * aviso chega com o app fechado. */
export const sendTestPush = createServerFn({ method: "POST" }).handler(async () => {
  const { assertRegisterAccess } = await import("./fastbar.server");
  await assertRegisterAccess();
  const { notifyStaff } = await import("./push.server");
  return notifyStaff({
    kind: "conta",
    title: "Teste de notificação",
    body: "Se você está lendo isto, os avisos do caixa chegam neste aparelho.",
    url: "/caixa",
    tag: "teste",
  });
});
