import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PasswordConfirm } from "@/components/shared/PasswordConfirm";
import { SectionCard } from "@/components/stock/SharedFormFields";
import { brl } from "@/lib/format";
import {
  closeOperationAfterReview,
  getClosureCandidates,
  resolveClosure,
} from "@/lib/operation-closure.functions";

export const Route = createFileRoute("/caixa/fechamento")({
  head: () => ({
    meta: [{ title: "Fechamento de operação | FastBar" }],
  }),
  component: FechamentoOperacao,
});

type Candidates = Awaited<ReturnType<typeof getClosureCandidates>>;
type Destino = "cortesia" | "inadimplencia" | "mantida_aberta";

const DESTINO_LABEL: Record<Destino, string> = {
  cortesia: "Cortesia",
  inadimplencia: "Inadimplência",
  mantida_aberta: "Manter aberta",
};

/**
 * Tela de fechamento de operação (seção 3.4 da documentação funcional, P1.5-6 do CLAUDE.md):
 * nenhuma comanda aberta ou fechada (aguardando pagamento) fica sem um destino explícito antes de
 * a operação poder encerrar — cortesia, inadimplência, ou manter aberta pra próxima operação. Cada
 * destino exige senha, e cortesia/inadimplência também exigem motivo.
 */
function FechamentoOperacao() {
  const navigate = useNavigate();
  const loadCandidates = useServerFn(getClosureCandidates);
  const doResolve = useServerFn(resolveClosure);
  const doClose = useServerFn(closeOperationAfterReview);

  const [data, setData] = useState<Candidates | null>(null);
  const [resolving, setResolving] = useState<{ sessionId: string; destino: Destino } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  async function refresh() {
    setData(await loadCandidates());
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleResolve(password: string) {
    if (!resolving) return { ok: false as const, message: "Nada selecionado." };
    if (resolving.destino !== "mantida_aberta" && motivo.trim().length < 5) {
      return { ok: false as const, message: "Descreva o motivo." };
    }
    const result = await doResolve({
      data: {
        password,
        sessionId: resolving.sessionId,
        destino: resolving.destino,
        motivo: resolving.destino === "mantida_aberta" ? undefined : motivo,
      },
    });
    if (result.ok) {
      setResolving(null);
      setMotivo("");
      await refresh();
    }
    return result;
  }

  async function handleClose(password: string) {
    const result = await doClose({ data: { password } });
    if (result.ok) {
      await navigate({ to: "/caixa", replace: true });
    } else {
      setCloseError(result.message ?? null);
    }
    return result;
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8 text-sm text-muted-foreground">Carregando…</main>
    );
  }

  if (!data.operationId) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <SectionCard title="Nenhuma operação aberta">
          <p className="text-sm text-muted-foreground">Não há o que encerrar agora.</p>
          <button
            onClick={() => void navigate({ to: "/caixa", replace: true })}
            className="mt-4 h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Voltar
          </button>
        </SectionCard>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-destructive">
          Encerrar operação
        </p>
        <h1 className="mt-1 text-2xl font-bold">Comandas pendentes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toda comanda aberta ou aguardando pagamento precisa de um destino antes de a operação
          poder encerrar.
        </p>
      </div>

      {data.candidates.length === 0 ? (
        <SectionCard title="Tudo revisado">
          <p className="text-sm text-muted-foreground">
            Nenhuma comanda pendente. A operação pode ser encerrada.
          </p>
        </SectionCard>
      ) : (
        <SectionCard title={`${data.candidates.length} comanda(s) sem destino`}>
          <div className="space-y-3">
            {data.candidates.map((item) => (
              <div key={item.sessionId} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{item.customerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.status === "open" ? "Em andamento" : "Aguardando pagamento"}
                    </p>
                  </div>
                  <p className="text-sm font-bold">{brl(item.total)}</p>
                </div>

                {resolving?.sessionId === item.sessionId ? (
                  <div className="mt-3 space-y-2">
                    {resolving.destino !== "mantida_aberta" && (
                      <label className="block">
                        <span className="text-xs font-medium text-muted-foreground">Motivo</span>
                        <input
                          type="text"
                          value={motivo}
                          onChange={(event) => setMotivo(event.target.value)}
                          placeholder={
                            resolving.destino === "cortesia"
                              ? "Por que esta comanda não vai ser cobrada?"
                              : "Por que o cliente não vai pagar agora?"
                          }
                          autoFocus
                          className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
                        />
                      </label>
                    )}
                    <PasswordConfirm
                      message={`Confirme a senha da equipe para "${DESTINO_LABEL[resolving.destino]}".`}
                      confirmLabel="Confirmar"
                      onCancel={() => {
                        setResolving(null);
                        setMotivo("");
                      }}
                      onConfirm={handleResolve}
                    />
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        setResolving({ sessionId: item.sessionId, destino: "cortesia" })
                      }
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium"
                    >
                      Cortesia
                    </button>
                    <button
                      onClick={() =>
                        setResolving({ sessionId: item.sessionId, destino: "inadimplencia" })
                      }
                      className="rounded-full border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive"
                    >
                      Inadimplência
                    </button>
                    <button
                      onClick={() =>
                        setResolving({ sessionId: item.sessionId, destino: "mantida_aberta" })
                      }
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium"
                    >
                      Manter aberta
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {closeError && <p className="text-sm text-destructive">{closeError}</p>}

      {confirmingClose ? (
        <PasswordConfirm
          message="Confirme a senha da equipe para encerrar a operação. Depois disso não dá mais para lançar vendas nela."
          confirmLabel="Encerrar operação"
          onCancel={() => setConfirmingClose(false)}
          onConfirm={handleClose}
        />
      ) : (
        <button
          onClick={() => {
            setCloseError(null);
            setConfirmingClose(true);
          }}
          disabled={data.candidates.length > 0}
          className="h-12 w-full rounded-xl bg-destructive text-sm font-semibold text-destructive-foreground disabled:opacity-60"
        >
          {data.candidates.length > 0
            ? `Resolva as ${data.candidates.length} comanda(s) pendentes primeiro`
            : "Encerrar operação"}
        </button>
      )}
    </main>
  );
}
