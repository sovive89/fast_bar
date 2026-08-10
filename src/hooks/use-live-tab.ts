import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCustomerTab, getRegisterTab } from "@/lib/tab-reads.functions";
import type { BarSession, BarTabItem } from "@/types/fastbar";

const POLL_MS = 10000;

/** Live comanda state (session + items) read through the server and refreshed by polling. */
export function useLiveTab(sessionId: string, scope: "customer" | "register" = "customer") {
  const [session, setSession] = useState<BarSession | null>(null);
  const [items, setItems] = useState<BarTabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const load = useServerFn(scope === "register" ? getRegisterTab : getCustomerTab);

  const reload = useCallback(async () => {
    const result = await load({ data: { sessionId } });
    setSession((result.session as BarSession | null) ?? null);
    setItems((result.items as BarTabItem[] | null) ?? []);
    setLoading(false);
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

  return { session, items, loading, now, reload };
}
