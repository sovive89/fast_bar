/*
 * Service worker das notificações push do caixa (pedido de conta e, depois, alerta de apoio).
 *
 * Fica em /push-sw.js, servido direto da pasta public: o plugin de PWA do projeto NÃO entrega um
 * service worker em produção (ver o comentário em vite.config.ts), então este arquivo é o único e
 * não faz cache nenhum — só recebe o aviso e mostra a notificação.
 *
 * Regra do navegador (e obrigatória no iPhone): TODO push recebido precisa virar uma notificação
 * visível; por isso `showNotification` é chamado sempre, mesmo se o conteúdo vier malformado.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** O aviso de apoio vibra e fica na tela de um jeito diferente do pedido de conta. */
const VIBRATION = {
  apoio: [600, 200, 600, 200, 600, 200, 600],
  conta: [200, 100, 200],
};

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = { body: event.data ? event.data.text() : "" };
  }

  // `json()` pode devolver null, texto ou número: só objeto vale, o resto vira aviso genérico.
  if (!data || typeof data !== "object") data = {};

  const kind = data.kind === "apoio" ? "apoio" : "conta";
  const title = typeof data.title === "string" && data.title ? data.title : "FastBar";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      // Mesmo tag = a notificação nova substitui a anterior do mesmo assunto; `renotify` faz tocar
      // de novo mesmo assim.
      tag: typeof data.tag === "string" && data.tag ? data.tag : kind,
      renotify: true,
      // Fica na tela até a equipe tocar: um pedido de conta não pode sumir sozinho.
      requireInteraction: true,
      vibrate: VIBRATION[kind],
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: typeof data.url === "string" ? data.url : "/caixa", kind },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Só abre endereço do próprio app: o conteúdo do push vem do servidor, mas não confia em link
  // que leve para fora.
  let target = new URL("/caixa", self.location.origin);
  try {
    const raw = event.notification.data && event.notification.data.url;
    if (typeof raw === "string") {
      const wanted = new URL(raw, self.location.origin);
      if (wanted.origin === self.location.origin) target = wanted;
    }
  } catch (error) {
    // mantém /caixa
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client.focus().then(() => ("navigate" in client ? client.navigate(target.href) : undefined));
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
