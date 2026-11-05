/**
 * Notificação push para a equipe (Web Push, padrão VAPID): avisa o celular do caixa mesmo com o app
 * fechado ou a tela bloqueada. Hoje serve ao pedido de conta; o alerta de apoio usa a mesma base
 * com outro `kind`.
 *
 * Princípios:
 * - Nunca derruba o fluxo que originou o aviso: falha de push (rede, aparelho morto, chave faltando)
 *   é registrada e engolida. O cliente que pediu a conta não pode ver erro porque o push falhou.
 * - O texto da notificação aparece na tela bloqueada: leva só o necessário (quem pediu a conta, e
 *   nada de dado sensível).
 * - Aparelho que o serviço de push declara inexistente (404/410) é apagado na hora.
 *
 * Configuração (variáveis do servidor, as mesmas do SUPABASE_SERVICE_ROLE_KEY): VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY e VAPID_SUBJECT (um "mailto:" ou um endereço https que identifique o bar).
 * Sem elas o push fica desligado e o resto do app funciona igual.
 */

export type PushKind = "conta" | "apoio" | "equipe";

export interface PushPayload {
  kind: PushKind;
  title: string;
  body: string;
  /** Para onde o toque na notificação leva (caminho dentro do app). */
  url: string;
  /** Mesmo tag = a notificação nova substitui a anterior do mesmo assunto, sem empilhar. */
  tag: string;
}

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** Lê as variáveis de ambiente. Nulo = push desligado (falta alguma das três). */
export function readPushConfig(
  env: Record<string, string | undefined> = process.env,
): PushConfig | null {
  const publicKey = env["VAPID_PUBLIC_KEY"]?.trim();
  const privateKey = env["VAPID_PRIVATE_KEY"]?.trim();
  const subject = env["VAPID_SUBJECT"]?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Valida o que o navegador mandou antes de gravar. O endpoint tem que ser https (todo serviço de
 * push real é): isso impede usar a inscrição para fazer o servidor chamar endereço interno.
 */
export function validateSubscription(
  input: unknown,
): { ok: true; value: PushSubscriptionInput } | { ok: false; message: string } {
  const data = input as Partial<PushSubscriptionInput> | null;
  const endpoint = typeof data?.endpoint === "string" ? data.endpoint.trim() : "";
  const p256dh = typeof data?.keys?.p256dh === "string" ? data.keys.p256dh.trim() : "";
  const auth = typeof data?.keys?.auth === "string" ? data.keys.auth.trim() : "";
  if (!endpoint || !p256dh || !auth)
    return { ok: false, message: "Inscrição de notificação incompleta." };
  if (endpoint.length > 2048) return { ok: false, message: "Endereço de notificação inválido." };
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false, message: "Endereço de notificação inválido." };
  }
  if (url.protocol !== "https:") return { ok: false, message: "Endereço de notificação inválido." };
  return { ok: true, value: { endpoint, keys: { p256dh, auth } } };
}

export async function saveSubscription(
  input: unknown,
  userAgent: string | null,
  staffId: string | null = null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const checked = validateSubscription(input);
  if (!checked.ok) return checked;
  const { admin } = await import("./fastbar.server");
  const { endpoint, keys } = checked.value;
  const nowIso = new Date().toISOString();

  // Mesmo aparelho ativando de novo: atualiza as chaves em vez de duplicar (endpoint é único).
  const { data: existing } = await admin()
    .from("fastbar_push_subscriptions")
    .select("id")
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (existing) {
    const { error } = await admin()
      .from("fastbar_push_subscriptions")
      .update({
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent,
        last_seen_at: nowIso,
        // Só troca o dono quando quem inscreve tem usuário próprio; a senha única não apaga o dono.
        ...(staffId ? { staff_id: staffId } : {}),
      })
      .eq("id", existing.id);
    if (error) return { ok: false, message: "Não foi possível ativar as notificações." };
    return { ok: true };
  }
  const { error } = await admin()
    .from("fastbar_push_subscriptions")
    .insert({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: userAgent,
      ...(staffId ? { staff_id: staffId } : {}),
    });
  if (error) return { ok: false, message: "Não foi possível ativar as notificações." };
  return { ok: true };
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const { admin } = await import("./fastbar.server");
  await admin().from("fastbar_push_subscriptions").delete().eq("endpoint", endpoint);
}

export interface NotifyResult {
  sent: number;
  removed: number;
  failed: number;
  skipped?: "not_configured" | "no_subscribers";
}

/** Códigos que significam "esse aparelho não existe mais": apaga a inscrição. */
const GONE_STATUS = new Set([404, 410]);

/**
 * Manda o aviso para todos os aparelhos da equipe inscritos. Nunca lança: o chamador (pedido de
 * conta) não pode falhar por causa do push. Cada envio tem tempo limite para um serviço de push
 * lento não segurar a resposta ao cliente.
 */
export async function notifyStaff(
  payload: PushPayload,
  options: { timeoutMs?: number; onlyAdmins?: boolean } = {},
): Promise<NotifyResult> {
  const result: NotifyResult = { sent: 0, removed: 0, failed: 0 };
  try {
    const config = readPushConfig();
    if (!config) return { ...result, skipped: "not_configured" };

    const { admin } = await import("./fastbar.server");
    let query = admin().from("fastbar_push_subscriptions").select("endpoint, p256dh, auth");
    if (options.onlyAdmins) {
      // Avisos de gestão (ex.: login da equipe) vão só para aparelhos de administradores ativos.
      const { data: admins } = await admin()
        .from("fastbar_staff_users")
        .select("id")
        .eq("role", "admin")
        .eq("status", "ativo");
      const ids = (admins ?? []).map((row) => row.id);
      if (ids.length === 0) return { ...result, skipped: "no_subscribers" };
      query = query.in("staff_id", ids);
    }
    const { data: subscriptions } = await query;
    if (!subscriptions || subscriptions.length === 0)
      return { ...result, skipped: "no_subscribers" };

    // web-push é CommonJS: conforme o empacotador, a API vem em `default` ou no próprio módulo.
    const mod = await import("web-push");
    const webpush = mod.default ?? mod;
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

    const body = JSON.stringify(payload);
    const timeout = options.timeoutMs ?? 4000;

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            body,
            // 'urgent': o serviço de push entrega já, sem esperar o aparelho acordar do modo
            // econômico. TTL curto: um "pediu a conta" de uma hora atrás não serve mais.
            { TTL: 120, urgency: "high", timeout },
          );
          result.sent += 1;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status !== undefined && GONE_STATUS.has(status)) {
            // Reaproveita o cliente já carregado (sem nova importação por aparelho).
            await admin()
              .from("fastbar_push_subscriptions")
              .delete()
              .eq("endpoint", subscription.endpoint);
            result.removed += 1;
          } else {
            result.failed += 1;
            console.error(
              "[push] falha ao notificar um aparelho",
              status ?? (error as Error).message,
            );
          }
        }
      }),
    );
  } catch (error) {
    console.error("[push] falha ao preparar o envio", (error as Error).message);
    result.failed += 1;
  }
  return result;
}
