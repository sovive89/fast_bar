import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCustomerTab, getRegisterTab } from "@/lib/tab-reads.functions";
import type { BarSession, BarTabItem } from "@/types/fastbar";

const POLL_MS = 10000;

/** Live comanda state (session + items) read through the server and refreshed by polling. */
export function useLiveTab(sessionId: string, scope: "customer" | "register" = "customer") {
  const [session, setSession] = useState<BarSession | null>(null);
  const [items, setItems] = useState<BarTabItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Só vira true quando o PRIMEIRO carregamento falha (ainda não há dado nenhum pra mostrar).
  // Falha em refresh posterior mantém a tela como está e não liga isso.
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const hasLoaded = useRef(false);
  const currentSession = useRef(sessionId);
  const loggedFailure = useRef(false);
  const load = useServerFn(scope === "register" ? getRegisterTab : getCustomerTab);

  const reload = useCallback(async () => {
    try {
      const result = await load({ data: { sessionId } });
      // Resposta de uma comanda que já não é a da tela (troca de rota no meio da chamada).
      if (currentSession.current !== sessionId) return;
      setSession((result.session as BarSession | null) ?? null);
      setItems((result.items as BarTabItem[] | null) ?? []);
      hasLoaded.current = true;
      loggedFailure.current = false;
      setLoadFailed(false);
      setLoadError(null);
      setLoading(false);
    } catch (error) {
      if (currentSession.current !== sessionId) return;
      // Falha de rede/servidor não pode derrubar a tela nem virar "comanda não encontrada":
      // se já havia dado, mantém; se era o primeiro carregamento, sinaliza erro (o polling tenta
      // de novo sozinho).
      // Loga só a primeira falha de uma sequência, pra uma queda longa não encher o console a
      // cada 10 s de polling.
      if (!loggedFailure.current) {
        loggedFailure.current = true;
        console.error("[useLiveTab] falha ao carregar a comanda", error);
      }
      if (!hasLoaded.current) {
        setLoadFailed(true);
        setLoadError(error instanceof Error ? error.message : String(error));
        // Sai do "Carregando": quem renderiza decide mostrar o erro (loadFailed) em vez de ficar
        // preso numa tela de loading eterna.
        setLoading(false);
      }
    }
  }, [sessionId, load]);

  useEffect(() => {
    // Comanda nova na mesma rota: zera tudo da anterior, senão uma falha aqui mostraria os dados
    // do cliente que estava na tela antes.
    currentSession.current = sessionId;
    hasLoaded.current = false;
    loggedFailure.current = false;
    setSession(null);
    setItems([]);
    setLoading(true);
    setLoadFailed(false);
    setLoadError(null);
    void reload();
    const poll = setInterval(() => void reload(), POLL_MS);
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(poll);
      clearInterval(timer);
    };
  }, [reload, sessionId]);

  return { session, items, loading, loadFailed, loadError, now, reload };
}
