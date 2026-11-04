/**
 * Parte do navegador do push: registrar o service worker, pedir permissão e inscrever o aparelho.
 * Só roda no cliente. Tudo que muda de estado (permissão, inscrição) precisa acontecer dentro de um
 * toque da pessoa — é exigência do navegador, e é por isso que ficam em funções chamadas por botão.
 */

export type PushSupport = "ok" | "needs-install" | "unsupported";

export interface PushState {
  support: PushSupport;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
}

const SW_URL = "/push-sw.js";

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS recente se identifica como Mac, mas tem tela de toque.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * O que este aparelho consegue. No iPhone, push só existe com o app INSTALADO na tela inicial
 * (iOS 16.4 ou mais novo); no navegador comum do iPhone a API nem aparece.
 */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (isIos() && !isStandalone()) return "needs-install";
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  return "ok";
}

export async function readPushState(): Promise<PushState> {
  const support = pushSupport();
  if (support !== "ok") return { support, permission: "unsupported", subscribed: false };
  let subscribed = false;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    subscribed = Boolean(await registration?.pushManager.getSubscription());
  } catch {
    subscribed = false;
  }
  return { support, permission: Notification.permission, subscribed };
}

/** A chave pública VAPID vem em base64 "url-safe"; o navegador quer bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Pede permissão e inscreve este aparelho. Chame DENTRO de um toque. */
export async function enablePush(
  publicKey: string,
): Promise<{ ok: true; subscription: PushSubscriptionJSON } | { ok: false; message: string }> {
  if (pushSupport() !== "ok")
    return { ok: false, message: "Este aparelho não recebe notificações aqui." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      message:
        permission === "denied"
          ? "As notificações estão bloqueadas. Libere nas configurações do navegador e tente de novo."
          : "Você não autorizou as notificações.",
    };
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
    await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));
    return { ok: true, subscription: subscription.toJSON() };
  } catch (error) {
    return { ok: false, message: `Não foi possível ativar: ${(error as Error).message}` };
  }
}

/** Cancela a inscrição deste aparelho e devolve o endereço dela (para o servidor apagar). */
export async function disablePush(): Promise<string | null> {
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
