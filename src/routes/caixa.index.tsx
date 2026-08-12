import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { brl, digits, elapsed, formatPhone, hhmm } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { getRegisterOverview } from "@/lib/tab-reads.functions";
import {
  archiveClosedSessions,
  archiveSession,
  clearTabItems,
  removeTabItem,
  unarchiveSession,
  undoLastTabItem,
} from "@/lib/register.functions";
import type { BarSession } from "@/types/fastbar";

type OverviewItem = {
  id: string;
  session_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  added_at: string;
};

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

/** Código curto e legível pra equipe conferir o cliente sem ler um UUID inteiro. */
function shortId(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/-/g, "").slice(0, 6).toUpperCase();
}

function RegisterList() {
  const [sessions, setSessions] = useState<BarSession[]>([]);
  const [items, setItems] = useState<OverviewItem[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"open" | "all" | "archived">("open");
  const [now, setNow] = useState(() => Date.now());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ kind: string; sessionId?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useServerFn(getRegisterOverview);
  const undoLast = useServerFn(undoLastTabItem);
  const removeItem = useServerFn(removeTabItem);
  const clearItems = useServerFn(clearTabItems);
  const archiveOne = useServerFn(archiveSession);
  const unarchiveOne = useServerFn(unarchiveSession);
  const archiveClosed = useServerFn(archiveClosedSessions);

  async function load() {
    const result = await loadOverview();
    setSessions(result.sessions as BarSession[]);
    setItems(result.items as OverviewItem[]);
  }

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 10000);
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(poll);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemsBySession = useMemo(() => {
    const map = new Map<string, OverviewItem[]>();
    for (const item of items) {
      const list = map.get(item.session_id) ?? [];
      list.push(item);
      map.set(item.session_id, list);
    }
    return map;
  }, [items]);

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
      .filter((session) => {
        const archived = Boolean(session.archived_at);
        if (view === "archived") return archived;
        if (archived) return false;
        return view === "all" ? true : session.status !== "paid";
      })
      .filter((session) => {
        if (!term) return true;
        return (
          session.customer_name.toLowerCase().includes(term) ||
          (termDigits.length > 0 && session.phone.includes(termDigits))
        );
      });
  }, [sessions, search, view]);

  const openSessions = sessions.filter((session) => session.status === "open");
  const openTotal = openSessions.reduce((sum, session) => sum + (totals.get(session.id) ?? 0), 0);
  const archivableCount = sessions.filter(
    (session) =>
      !session.archived_at && (session.status === "closed" || session.status === "paid"),
  ).length;

  async function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    setBusy(true);
    const result = await action();
    setBusy(false);
    setConfirming(null);
    if (!result.ok) return setError(result.message ?? "Não foi possível concluir.");
    await load();
  }

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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(
          [
            { id: "open", label: "Em aberto" },
            { id: "all", label: "Todas" },
            { id: "archived", label: "Arquivadas" },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            onClick={() => setView(option.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${view === option.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
          >
            {option.label}
          </button>
        ))}
        {view === "all" && archivableCount > 0 && (
          <button
            onClick={() => setConfirming({ kind: "archiveAll" })}
            className="ml-auto rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Arquivar fechadas ({archivableCount})
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {confirming?.kind === "archiveAll" && (
        <ConfirmBar
          message={`Tirar ${archivableCount} comandas fechadas/pagas da lista? Nada é apagado — elas continuam no faturamento e você pode revê-las em "Arquivadas".`}
          confirmLabel="Arquivar"
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => run(() => archiveClosed({ data: {} }))}
        />
      )}

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Nenhuma comanda encontrada.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {filtered.map((session) => {
            const isExpanded = expandedId === session.id;
            const sessionItems = itemsBySession.get(session.id) ?? [];
            const code = shortId(session.customer_id ?? session.id);
            const isPaid = session.status === "paid";
            const isArchived = Boolean(session.archived_at);
            const canArchive = !isArchived && (session.status === "closed" || isPaid);

            return (
              <li key={session.id} className="rounded-2xl border border-border bg-card">
                <div className="flex items-start gap-1 p-4">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : session.id)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {session.customer_name}
                        {code && (
                          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                            #{code}
                          </span>
                        )}
                      </p>
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
                  </button>
                  {canArchive && (
                    <button
                      onClick={() => run(() => archiveOne({ data: { sessionId: session.id } }))}
                      disabled={busy}
                      title="Tirar da lista (não apaga)"
                      aria-label="Tirar da lista"
                      className="-mr-1 shrink-0 rounded-full px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                    >
                      ×
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-border p-4">
                    {sessionItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum lançamento ainda.</p>
                    ) : (
                      <ul className="space-y-2">
                        {sessionItems.map((item) => (
                          <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate">
                              {item.quantity}× {item.name}
                            </span>
                            <span className="flex shrink-0 items-center gap-3">
                              <span className="font-semibold">
                                {brl(Number(item.unit_price) * item.quantity)}
                              </span>
                              {!isPaid && (
                                <button
                                  onClick={() => run(() => removeItem({ data: { itemId: item.id } }))}
                                  disabled={busy}
                                  className="text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-60"
                                  title="Cancelar este lançamento"
                                >
                                  Cancelar
                                </button>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {confirming?.sessionId === session.id ? (
                      <ConfirmBar
                        message="Zerar todos os lançamentos? A comanda continua aberta e o estoque volta."
                        confirmLabel="Zerar"
                        busy={busy}
                        onCancel={() => setConfirming(null)}
                        onConfirm={() => run(() => clearItems({ data: { sessionId: session.id } }))}
                      />
                    ) : (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          to="/caixa/$sessionId"
                          params={{ sessionId: session.id }}
                          className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground"
                        >
                          Abrir comanda
                        </Link>
                        {!isPaid && sessionItems.length > 0 && (
                          <>
                            <button
                              onClick={() => run(() => undoLast({ data: { sessionId: session.id } }))}
                              disabled={busy}
                              className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                            >
                              Desfazer último
                            </button>
                            <button
                              onClick={() => setConfirming({ kind: "clear", sessionId: session.id })}
                              className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
                            >
                              Zerar
                            </button>
                          </>
                        )}
                        {isArchived && (
                          <button
                            onClick={() => run(() => unarchiveOne({ data: { sessionId: session.id } }))}
                            disabled={busy}
                            className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                          >
                            Restaurar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function ConfirmBar(props: {
  message: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3">
      <p className="text-xs text-foreground">{props.message}</p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={props.onConfirm}
          disabled={props.busy}
          className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {props.busy ? "Salvando..." : props.confirmLabel}
        </button>
        <button
          onClick={props.onCancel}
          disabled={props.busy}
          className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
