import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, BellRing } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getPushStatus, sendTestPush, subscribePush, unsubscribePush } from "@/lib/push.functions";
import { disablePush, enablePush, readPushState, type PushState } from "@/lib/push-client";

/**
 * Botão do cabeçalho do caixa para ligar as notificações push NESTE aparelho (celular da equipe).
 * Com o push ligado, o pedido de conta chega mesmo com o app fechado e a tela bloqueada. O botão
 * abre um quadro curto que diz o estado e deixa ativar, desativar e mandar um teste.
 */
export function PushToggle() {
  const loadStatus = useServerFn(getPushStatus);
  const subscribe = useServerFn(subscribePush);
  const unsubscribe = useServerFn(unsubscribePush);
  const sendTest = useServerFn(sendTestPush);

  const [open, setOpen] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState(await readPushState());
  }, []);

  useEffect(() => {
    void refresh();
    void loadStatus()
      .then((status) => setPublicKey(status.publicKey))
      .catch(() => setPublicKey(null));
  }, [refresh, loadStatus]);

  const active = state?.subscribed === true && state.permission === "granted";

  async function turnOn() {
    if (!publicKey || busy) return;
    setBusy(true);
    setMessage(null);
    // O pedido de permissão tem que acontecer direto aqui, dentro do toque.
    const result = await enablePush(publicKey);
    if (result.ok) {
      const saved = await subscribe({
        data: {
          subscription: result.subscription as {
            endpoint: string;
            keys: { p256dh: string; auth: string };
          },
          userAgent: navigator.userAgent,
        },
      });
      setMessage(saved.ok ? "Pronto! Este aparelho vai receber os avisos." : saved.message);
    } else {
      setMessage(result.message);
    }
    await refresh();
    setBusy(false);
  }

  async function turnOff() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const endpoint = await disablePush();
    if (endpoint) await unsubscribe({ data: { endpoint } });
    setMessage("Avisos desligados neste aparelho.");
    await refresh();
    setBusy(false);
  }

  async function test() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await sendTest();
    setMessage(
      result.sent > 0
        ? `Teste enviado para ${result.sent} aparelho${result.sent === 1 ? "" : "s"}.`
        : result.skipped === "no_subscribers"
          ? "Nenhum aparelho está inscrito ainda."
          : "O teste não saiu. Confira se o servidor tem as chaves de notificação.",
    );
    setBusy(false);
  }

  const Icon = active ? BellRing : publicKey === null ? BellOff : Bell;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Avisos no celular"
        aria-expanded={open}
        className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-border"
      >
        <Icon className="h-5 w-5" aria-hidden />
        {!active && publicKey && (
          <span
            className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-amber-500"
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-20 w-[min(20rem,calc(100vw-1.5rem))] space-y-3 rounded-2xl border border-border bg-card p-4 text-sm shadow-lg">
          <p className="font-semibold">Avisos no celular</p>

          {publicKey === null ? (
            <p className="text-muted-foreground">
              As notificações ainda não foram configuradas no servidor. Quem cuida do sistema
              precisa cadastrar as chaves de notificação.
            </p>
          ) : state?.support === "needs-install" ? (
            <p className="text-muted-foreground">
              No iPhone, instale o app primeiro: toque em Compartilhar e depois em &quot;Adicionar à
              Tela de Início&quot;. Abra o app instalado e volte aqui.
            </p>
          ) : state?.support === "unsupported" ? (
            <p className="text-muted-foreground">Este navegador não recebe notificações.</p>
          ) : (
            <>
              <p className="text-muted-foreground">
                {active
                  ? "Ligados neste aparelho: o pedido de conta chega mesmo com o app fechado."
                  : state?.permission === "denied"
                    ? "Bloqueados no navegador. Libere nas configurações do site e tente de novo."
                    : "Ative para receber o pedido de conta mesmo com o app fechado."}
              </p>
              {active ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void test()}
                    className="h-11 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    Enviar teste
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void turnOff()}
                    className="h-11 rounded-xl border border-border text-sm font-medium disabled:opacity-60"
                  >
                    Desativar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy || state?.permission === "denied"}
                  onClick={() => void turnOn()}
                  className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {busy ? "Ativando..." : "Ativar neste aparelho"}
                </button>
              )}
            </>
          )}

          {message && (
            <p role="status" className="text-xs text-muted-foreground">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
