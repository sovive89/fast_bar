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
  const [now, setNow] = useState(() => Date.now());
  const hasLoaded = useRef(false);
  const load = useServerFn(scope === "register" ? getRegisterTab : getCustomerTab);

  const reload = useCallback(async () => {
    try {
      const result = await load({ data: { sessionId } });
      setSession((result.session as BarSession | null) ?? null);
      setItems((result.items as BarTabItem[] | null) ?? []);
      hasLoaded.current = true;
      setLoadFailed(false);
      setLoading(false);
    } catch (error) {
      // Falha de rede/servidor não pode derrubar a tela nem virar "comanda não encontrada":
      // se já havia dado, mantém; se era o primeiro carregamento, sinaliza erro (o polling tenta
      // de novo sozinho).
      console.error("[useLiveTab] falha ao carregar a comanda", error);
      setLoadFailed((failed) => failed || !hasLoaded.current);
    }
  }, [sessionId, load]);

  useEffect(() => {
    void reload();
    const poll = setInterval(() => void reload(), POLL_MS);
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(poll);
      clearInterval(timer);
    };
  }, [reload]);

  return { session, items, loading, loadFailed, now, reload };
}
