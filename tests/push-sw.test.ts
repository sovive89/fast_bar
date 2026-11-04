import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Roda o service worker real (public/push-sw.js) num `self` falso e dispara os eventos que o
 * navegador dispararia. Confere o que a equipe vê (notificação) e para onde o toque leva.
 */
type Handler = (event: Record<string, unknown>) => void;

function loadServiceWorker() {
  const handlers = new Map<string, Handler>();
  const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  const focused: string[] = [];
  let windows: Array<{
    url: string;
    focus: () => Promise<void>;
    navigate?: (url: string) => Promise<void>;
  }> = [];

  const self = {
    location: { origin: "https://bar.example.com" },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(),
    registration: {
      showNotification: vi.fn(async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
      }),
    },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async (url: string) => {
        opened.push(url);
      }),
    },
  };
  new Function("self", readFileSync("public/push-sw.js", "utf8"))(self);

  const pending: Promise<unknown>[] = [];
  const event = (extra: Record<string, unknown>) => ({
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    ...extra,
  });
  return {
    shown,
    opened,
    navigated,
    focused,
    setWindows: (list: Array<{ url: string }>) => {
      windows = list.map((w) => ({
        url: w.url,
        focus: async () => {
          focused.push(w.url);
        },
        navigate: async (url: string) => {
          navigated.push(url);
        },
      }));
    },
    push: async (data: unknown, raw = false) => {
      handlers.get("push")!(
        event({
          data: {
            json: () => {
              if (raw) throw new Error("não é json");
              return data;
            },
            text: () => String(data),
          },
        }),
      );
      await Promise.all(pending.splice(0));
    },
    click: async (url: unknown) => {
      const close = vi.fn();
      handlers.get("notificationclick")!(event({ notification: { close, data: { url } } }));
      await Promise.all(pending.splice(0));
      return close;
    },
  };
}

let sw: ReturnType<typeof loadServiceWorker>;
beforeEach(() => {
  sw = loadServiceWorker();
});

describe("service worker do push", () => {
  it("mostra a notificação do pedido de conta e ela fica na tela até a equipe tocar", async () => {
    await sw.push({
      kind: "conta",
      title: "Pedido de conta",
      body: "Ana pediu a conta",
      url: "/caixa/s1",
      tag: "conta-s1",
    });
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0]!.title).toBe("Pedido de conta");
    expect(sw.shown[0]!.options).toMatchObject({
      body: "Ana pediu a conta",
      tag: "conta-s1",
      renotify: true,
      requireInteraction: true,
      data: { url: "/caixa/s1", kind: "conta" },
    });
  });

  it("o alerta de apoio vibra de outro jeito, mais longo", async () => {
    await sw.push({ kind: "conta", title: "a" });
    await sw.push({ kind: "apoio", title: "b" });
    const conta = sw.shown[0]!.options["vibrate"] as number[];
    const apoio = sw.shown[1]!.options["vibrate"] as number[];
    expect(apoio.length).toBeGreaterThan(conta.length);
    expect(Math.max(...apoio)).toBeGreaterThan(Math.max(...conta));
  });

  it("SEMPRE mostra algo, mesmo com conteúdo malformado (o iPhone exige notificação visível)", async () => {
    await sw.push("texto solto, não é json", true);
    await sw.push({});
    await sw.push(null);
    expect(sw.shown).toHaveLength(3);
    for (const item of sw.shown) expect(item.title).toBe("FastBar");
  });

  it("tocar abre o app na comanda e fecha a notificação", async () => {
    const close = await sw.click("/caixa/s1");
    expect(close).toHaveBeenCalled();
    expect(sw.opened).toEqual(["https://bar.example.com/caixa/s1"]);
  });

  it("se o app já está aberto, usa a janela existente em vez de abrir outra", async () => {
    sw.setWindows([{ url: "https://bar.example.com/caixa" }]);
    await sw.click("/caixa/s1");
    expect(sw.opened).toEqual([]);
    expect(sw.focused).toEqual(["https://bar.example.com/caixa"]);
    expect(sw.navigated).toEqual(["https://bar.example.com/caixa/s1"]);
  });

  it("nunca leva para fora do app, mesmo que o aviso peça", async () => {
    await sw.click("https://site-malicioso.example/phishing");
    await sw.click("//outro.example/x");
    await sw.click(undefined);
    expect(sw.opened).toEqual([
      "https://bar.example.com/caixa",
      "https://bar.example.com/caixa",
      "https://bar.example.com/caixa",
    ]);
  });
});
