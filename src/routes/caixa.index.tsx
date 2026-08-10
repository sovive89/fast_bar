import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { brl, digits, elapsed, formatPhone, hhmm } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { getRegisterOverview } from "@/lib/tab-reads.functions";
import type { BarSession } from "@/types/fastbar";

export const Route = createFileRoute("/caixa/")({
  head: () => ({
    meta: [
      { title: "Caixa | Comandas do FastBar" },
      {
        name: "description",
        content: "Localize comandas por nome ou celular, lance bebidas e feche a conta.",
      },
      { property: "og:title", content: "Caixa | Comandas do FastBar" },
      {
        property: "og:description",
        content: "Comandas abertas, busca rápida e fechamento pelo caixa.",
      },
    ],
  }),
  component: RegisterList,
});

function RegisterList() {
  const [sessions, setSessions] = useState<BarSession[]>([]);
  const [items, setItems] = useState<
    { session_id: string; unit_price: number; quantity: number }[]
  >([]);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const loadOverview = useServerFn(getRegisterOverview);

  useEffect(() => {
    async function load() {
      const result = await loadOverview();
      setSessions(result.sessions as BarSession[]);
      setItems(result.items);
    }
    void load();
    const poll = setInterval(() => void load(), 10000);
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(poll);
      clearInterval(timer);
    };
  }, [loadOverview]);

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(
        item.session_id,
        (map.get(item.session_id) ?? 0) + Number(item.unit_price) * item.quantity,
      );
    }
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const termDigits = digits(search);
    return sessions
      .filter((session) => (showAll ? true : session.status !== "paid"))
      .filter((session) => {
        if (!term) return true;
        return (
          session.customer_name.toLowerCase().includes(term) ||
          (termDigits.length > 0 && session.phone.includes(termDigits))
        );
      });
  }, [sessions, search, showAll]);

  const openSessions = sessions.filter((session) => session.status === "open");
  const openTotal = openSessions.reduce((sum, session) => sum + (totals.get(session.id) ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Caixa</p>
          <h1 className="mt-1 text-3xl font-bold">Comandas</h1>
        </div>
        <div className="text-right text-sm">
          <p className="text-muted-foreground">{openSessions.length} abertas</p>
          <p className="font-semibold">{brl(openTotal)}</p>
        </div>
      </div>

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar por nome ou celular"
        className="mt-6 h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
      />

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setShowAll(false)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${!showAll ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
        >
          Em aberto
        </button>
        <button
          onClick={() => setShowAll(true)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${showAll ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
        >
          Todas
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Nenhuma comanda encontrada.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {filtered.map((session) => (
            <li key={session.id}>
              <Link
                to="/caixa/$sessionId"
                params={{ sessionId: session.id }}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-ring"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{session.customer_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPhone(session.phone)}
                    {session.started_at ? ` · ${hhmm(session.started_at)}` : ""} ·{" "}
                    {elapsed(session.started_at, session.closed_at ?? session.paid_at, now)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="font-bold">{brl(totals.get(session.id) ?? 0)}</p>
                  <StatusBadge status={session.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
